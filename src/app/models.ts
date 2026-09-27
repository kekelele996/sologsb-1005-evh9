export type Role = 'author' | 'examiner' | 'viewer'

export interface Claim {
  id: string
  number: number
  title: string
  text: string
  independent: boolean
}

export interface Paragraph {
  id: string
  section: string
  text: string
}

export interface Feature {
  id: string
  claimId: string
  label: string
  text: string
  parentId: string | null
  referenceIds: string[]
  supportIds: string[]
  ownerRole: Role
  archived?: boolean
}

export interface Annotation {
  id: string
  featureId: string
  authorRole: Role
  authorName: string
  text: string
  updatedAt: string
}

export interface OrphanMapping {
  id: string
  featureLabel: string
  paragraphId: string
  reason: string
}

export interface StructureRecord {
  id: string
  type: 'merge' | 'split'
  claimId: string
  createdAt: string
  sourceIds: string[]
  resultIds: string[]
  sourceLabels: string[]
  resultLabels: string[]
  summary: string
  detail: string
}

export interface MergePreview {
  claimId: string
  sourceIds: string[]
  sourceLabels: string[]
  text: string
  supportIds: string[]
  referenceIds: string[]
  parentId: string | null
  annotations: Annotation[]
  inbound: Array<{ id: string; kind: 'reference' | 'child' }>
}

export interface SplitPartDraft {
  label: string
  text: string
  supportIds: string[]
  referenceIds: string[]
}

export interface ClaimVersion {
  id: string
  name: string
  createdAt: string
  claims: Claim[]
  features: Feature[]
}

export interface Position {
  tab: string
  claimId: string
  featureId: string | null
  scrollY: number
}

export interface WorkbenchState {
  claims: Claim[]
  paragraphs: Paragraph[]
  features: Feature[]
  annotations: Annotation[]
  orphanMappings: OrphanMapping[]
  structureRecords: StructureRecord[]
  versions: ClaimVersion[]
  role: Role
  selectedClaimId: string
  selectedFeatureId: string | null
  activeTab: string
  currentUserRole: Role
}

export interface ValidationIssue {
  id: string
  severity: 'error' | 'warning'
  type: 'cycle' | 'missing-support' | 'orphan-mapping' | 'empty-feature'
  featureId?: string
  title: string
  detail: string
}
