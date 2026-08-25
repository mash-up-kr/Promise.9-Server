import postgres from 'postgres'

const MAX_ACTIVE_FOLDER_COUNT = 30

type DatabaseId = string
type IdParameter = string | number

export type FolderSelector =
    { id: IdParameter; name?: never } | { id?: never; name: string }

export type SourceFolder = {
    id: DatabaseId
    name: string
    color: string
    sortOrder: number | null
}

type SourceTag = {
    name: string
    normalizedName: string
    sourceType: string
    sortOrder: number | null
}

type SourceLink = {
    id: DatabaseId
    originalUrl: string
    normalizedUrl: string
    finalUrl: string | null
    domain: string | null
    title: string | null
    metadata: postgres.JSONValue | null
    aiSummary: string | null
    aiSummaryStatus: string
    embedding: string | null
    tags: SourceTag[]
}

export type LinkGroupSnapshot = {
    folder: SourceFolder | null
    links: SourceLink[]
}

export type CopyPreview = {
    sourceLinkCount: number
    sourceTagCount: number
    duplicateLinkCount: number
    insertLinkCount: number
    insertTagCount: number
    incompleteLinkCount: number
    targetFolderExists: boolean
}

export type CopyResult = {
    createdFolder: boolean
    insertedLinkCount: number
    insertedTagCount: number
    skippedDuplicateCount: number
}

type UserRow = {
    id: DatabaseId
    email: string
}

type FolderRow = {
    id: DatabaseId
    name: string
    color: string
    sortOrder: number | null
}

type LinkRow = {
    id: DatabaseId
    originalUrl: string
    normalizedUrl: string
    finalUrl: string | null
    domain: string | null
    title: string | null
    metadata: postgres.JSONValue | null
    aiSummary: string | null
    aiSummaryStatus: string
    embedding: string | null
}

type TagRow = {
    linkId: DatabaseId
    name: string
    normalizedName: string
    sourceType: string
    sortOrder: number | null
}

export async function findActiveUserById(
    sql: postgres.Sql,
    userId: IdParameter,
): Promise<UserRow | undefined> {
    const [user] = await sql<UserRow[]>`
        select id::text as id, email
        from users
        where id = ${userId}
          and deleted_at is null
        limit 1
    `

    return user
}

export async function findActiveUserByEmail(
    sql: postgres.Sql,
    email: string,
): Promise<UserRow | undefined> {
    const [user] = await sql<UserRow[]>`
        select id::text as id, email
        from users
        where email = ${email}
          and deleted_at is null
        limit 1
    `

    return user
}

export async function listActiveFolders(
    sql: postgres.Sql,
    userId: IdParameter,
): Promise<SourceFolder[]> {
    return sql<SourceFolder[]>`
        select
            id::text as id,
            name,
            color,
            sort_order as "sortOrder"
        from folders
        where user_id = ${userId}
          and deleted_at is null
        order by sort_order asc nulls last, id asc
    `
}

export async function readFolderSnapshot(
    sql: postgres.Sql,
    userId: IdParameter,
    selector: FolderSelector,
): Promise<LinkGroupSnapshot> {
    const [folder] =
        selector.id !== undefined
            ? await sql<FolderRow[]>`
                  select
                      id::text as id,
                      name,
                      color,
                      sort_order as "sortOrder"
                  from folders
                  where id = ${selector.id}
                    and user_id = ${userId}
                    and deleted_at is null
                  limit 1
              `
            : await sql<FolderRow[]>`
                  select
                      id::text as id,
                      name,
                      color,
                      sort_order as "sortOrder"
                  from folders
                  where name = ${selector.name}
                    and user_id = ${userId}
                    and deleted_at is null
                  limit 1
              `

    if (!folder) {
        const label =
            selector.id !== undefined
                ? `id=${selector.id}`
                : `name=${selector.name}`
        throw new Error(`마스터 계정에서 활성 폴더를 찾지 못했습니다: ${label}`)
    }

    return readLinkGroupSnapshot(sql, userId, folder)
}

export async function readUncategorizedSnapshot(
    sql: postgres.Sql,
    userId: IdParameter,
): Promise<LinkGroupSnapshot> {
    return readLinkGroupSnapshot(sql, userId, null)
}

async function readLinkGroupSnapshot(
    sql: postgres.Sql,
    userId: IdParameter,
    folder: FolderRow | null,
): Promise<LinkGroupSnapshot> {
    const linkRows = await sql<LinkRow[]>`
        select
            id::text as id,
            original_url as "originalUrl",
            normalized_url as "normalizedUrl",
            final_url as "finalUrl",
            domain,
            title,
            metadata,
            ai_summary as "aiSummary",
            ai_summary_status as "aiSummaryStatus",
            embedding::text as embedding
        from links
        where user_id = ${userId}
          and ${folder ? sql`folder_id = ${folder.id}` : sql`folder_id is null`}
          and deleted_at is null
        order by id asc
    `

    const tagRows =
        linkRows.length === 0
            ? []
            : await sql<TagRow[]>`
                  select
                      link_id::text as "linkId",
                      name,
                      normalized_name as "normalizedName",
                      source_type as "sourceType",
                      sort_order as "sortOrder"
                  from tags
                  where user_id = ${userId}
                    and link_id = any(${sql.array(
                        linkRows.map((link) => link.id),
                    )}::bigint[])
                  order by link_id asc, sort_order asc nulls last, id asc
              `

    const tagsByLinkId = new Map<DatabaseId, SourceTag[]>()
    for (const tag of tagRows) {
        const current = tagsByLinkId.get(tag.linkId) ?? []
        current.push(tag)
        tagsByLinkId.set(tag.linkId, current)
    }

    return {
        folder,
        links: linkRows.map((link) => ({
            ...link,
            tags: tagsByLinkId.get(link.id) ?? [],
        })),
    }
}

export async function previewCopy(
    sql: postgres.Sql,
    targetUserId: IdParameter,
    snapshot: LinkGroupSnapshot,
): Promise<CopyPreview> {
    const normalizedUrls = snapshot.links.map((link) => link.normalizedUrl)
    const duplicateRows: Array<{ normalizedUrl: string }> =
        normalizedUrls.length === 0
            ? []
            : await sql<{ normalizedUrl: string }[]>`
                  select normalized_url as "normalizedUrl"
                  from links
                  where user_id = ${targetUserId}
                    and deleted_at is null
                    and normalized_url = any(${sql.array(
                        normalizedUrls,
                    )}::text[])
              `
    const [targetFolder] = snapshot.folder
        ? await sql<{ id: DatabaseId }[]>`
              select id::text as id
              from folders
              where user_id = ${targetUserId}
                and name = ${snapshot.folder.name}
                and deleted_at is null
              limit 1
          `
        : []
    const duplicateUrls = new Set(duplicateRows.map((row) => row.normalizedUrl))

    return {
        sourceLinkCount: snapshot.links.length,
        sourceTagCount: snapshot.links.reduce(
            (count, link) => count + link.tags.length,
            0,
        ),
        duplicateLinkCount: duplicateRows.length,
        insertLinkCount: snapshot.links.length - duplicateRows.length,
        insertTagCount: snapshot.links
            .filter((link) => !duplicateUrls.has(link.normalizedUrl))
            .reduce((count, link) => count + link.tags.length, 0),
        incompleteLinkCount: snapshot.links.filter(
            (link) =>
                link.aiSummaryStatus !== 'SUCCESS' || link.embedding === null,
        ).length,
        targetFolderExists: targetFolder !== undefined,
    }
}

export async function copyLinkGroup(
    sql: postgres.Sql,
    targetUserId: DatabaseId,
    snapshot: LinkGroupSnapshot,
): Promise<CopyResult> {
    const [result] = await copyLinkGroups(sql, targetUserId, [snapshot])
    return result
}

export async function copyLinkGroups(
    sql: postgres.Sql,
    targetUserId: DatabaseId,
    snapshots: LinkGroupSnapshot[],
): Promise<CopyResult[]> {
    assertSnapshotsReady(snapshots)

    return sql.begin(async (tx) => {
        const [targetUser] = await tx<{ id: DatabaseId }[]>`
            select id::text as id
            from users
            where id = ${targetUserId}
              and deleted_at is null
            for update
        `

        if (!targetUser) {
            throw new Error(`활성 대상 유저를 찾지 못했습니다: ${targetUserId}`)
        }

        const results: CopyResult[] = []
        for (const snapshot of snapshots) {
            results.push(
                await copyLinkGroupInTransaction(tx, targetUserId, snapshot),
            )
        }

        return results
    })
}

async function copyLinkGroupInTransaction(
    tx: postgres.TransactionSql,
    targetUserId: DatabaseId,
    snapshot: LinkGroupSnapshot,
): Promise<CopyResult> {
    const { folderId, created } = await ensureTargetFolder(
        tx,
        targetUserId,
        snapshot.folder,
    )
    const copiedAt = new Date()
    let insertedLinkCount = 0
    let insertedTagCount = 0
    let skippedDuplicateCount = 0

    for (const link of snapshot.links) {
        const [inserted] = await tx<{ id: DatabaseId }[]>`
                insert into links (
                    user_id,
                    folder_id,
                    original_url,
                    normalized_url,
                    final_url,
                    domain,
                    title,
                    metadata,
                    ai_summary,
                    ai_summary_status,
                    embedding,
                    created_at,
                    updated_at
                )
                values (
                    ${targetUserId},
                    ${folderId},
                    ${link.originalUrl},
                    ${link.normalizedUrl},
                    ${link.finalUrl},
                    ${link.domain},
                    ${link.title},
                    ${link.metadata === null ? null : tx.json(link.metadata)},
                    ${link.aiSummary},
                    ${link.aiSummaryStatus},
                    ${link.embedding}::vector,
                    ${copiedAt},
                    ${copiedAt}
                )
                on conflict (user_id, normalized_url)
                    where deleted_at is null
                do nothing
                returning id::text as id
            `

        if (!inserted) {
            skippedDuplicateCount += 1
            continue
        }

        insertedLinkCount += 1

        for (const tag of link.tags) {
            await tx`
                    insert into tags (
                        user_id,
                        link_id,
                        name,
                        normalized_name,
                        source_type,
                        sort_order,
                        created_at,
                        updated_at
                    )
                    values (
                        ${targetUserId},
                        ${inserted.id},
                        ${tag.name},
                        ${tag.normalizedName},
                        ${tag.sourceType},
                        ${tag.sortOrder},
                        ${copiedAt},
                        ${copiedAt}
                    )
                `
            insertedTagCount += 1
        }
    }

    return {
        createdFolder: created,
        insertedLinkCount,
        insertedTagCount,
        skippedDuplicateCount,
    }
}

async function ensureTargetFolder(
    sql: postgres.TransactionSql,
    targetUserId: DatabaseId,
    sourceFolder: SourceFolder | null,
): Promise<{ folderId: DatabaseId | null; created: boolean }> {
    if (!sourceFolder) {
        return { folderId: null, created: false }
    }

    const [existing] = await sql<{ id: DatabaseId }[]>`
        select id::text as id
        from folders
        where user_id = ${targetUserId}
          and name = ${sourceFolder.name}
          and deleted_at is null
        limit 1
    `

    if (existing) {
        return { folderId: existing.id, created: false }
    }

    const [count] = await sql<{ value: number }[]>`
        select count(*)::int as value
        from folders
        where user_id = ${targetUserId}
          and deleted_at is null
    `

    if (count.value >= MAX_ACTIVE_FOLDER_COUNT) {
        throw new Error(
            `대상 유저의 활성 폴더가 ${MAX_ACTIVE_FOLDER_COUNT}개여서 새 폴더를 만들 수 없습니다.`,
        )
    }

    const [inserted] = await sql<{ id: DatabaseId }[]>`
        insert into folders (
            user_id,
            name,
            color,
            sort_order,
            created_at,
            updated_at
        )
        values (
            ${targetUserId},
            ${sourceFolder.name},
            ${sourceFolder.color},
            ${sourceFolder.sortOrder},
            now(),
            now()
        )
        on conflict (user_id, name)
            where deleted_at is null
        do nothing
        returning id::text as id
    `

    if (inserted) {
        return { folderId: inserted.id, created: true }
    }

    const [concurrent] = await sql<{ id: DatabaseId }[]>`
        select id::text as id
        from folders
        where user_id = ${targetUserId}
          and name = ${sourceFolder.name}
          and deleted_at is null
        limit 1
    `

    if (!concurrent) {
        throw new Error('대상 폴더 생성 후 조회에 실패했습니다.')
    }

    return { folderId: concurrent.id, created: false }
}

function assertSnapshotsReady(snapshots: LinkGroupSnapshot[]): void {
    const incompleteCount = snapshots.reduce(
        (count, snapshot) =>
            count +
            snapshot.links.filter(
                (link) =>
                    link.aiSummaryStatus !== 'SUCCESS' ||
                    link.embedding === null,
            ).length,
        0,
    )

    if (incompleteCount > 0) {
        throw new Error(
            `요약·임베딩이 완료되지 않은 링크 ${incompleteCount}개는 복제할 수 없습니다.`,
        )
    }
}
