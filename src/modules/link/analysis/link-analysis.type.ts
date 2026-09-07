import { LinkRow } from '../link.schema'
import { TagRow } from '../tag.schema'

import { LinkJobType } from './link-job.schema'

export const LINK_ANALYSIS_EXECUTOR = Symbol('LINK_ANALYSIS_EXECUTOR')
export type LinkAnalysisFailureKind = 'RETRYABLE' | 'PERMANENT'
export type AnalysisInput = {
    jobType: LinkJobType
    link: Pick<
        LinkRow,
        'id' | 'originalUrl' | 'title' | 'metadata' | 'aiSummary'
    >
    tags: Array<
        Pick<TagRow, 'name' | 'normalizedName' | 'sourceType' | 'sortOrder'>
    >
}
export type AnalysisResult = {
    patch: Partial<
        Pick<
            LinkRow,
            'title' | 'metadata' | 'aiSummary' | 'aiSummaryStatus' | 'embedding'
        >
    >
    aiTags?: Array<{ name: string; normalizedName: string; sortOrder: number }>
    failure?: { retryable: boolean; code: string; message: string }
}
export interface AnalysisExecutor {
    execute(input: AnalysisInput, signal: AbortSignal): Promise<AnalysisResult>
}
