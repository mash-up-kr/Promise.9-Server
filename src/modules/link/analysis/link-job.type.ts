import { LinkRow } from '../link.schema'
import { TagRow } from '../tag.schema'

import { LinkJob } from './link-job.schema'

export type ClaimedJob = { job: LinkJob; link: LinkRow; tags: TagRow[] }
