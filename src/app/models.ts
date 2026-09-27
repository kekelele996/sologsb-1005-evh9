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
  /** active 参与特征树与校验；history 为结构调整（合并/拆分）后留存的历史特征 */
  status?: 'active' | 'history'
}

/** 结构调整中一条父子或引用关系的去向 */
export interface StructureRelationRow {
  type: 'parent' | 'reference'
  featureId: string
  featureLabel: string
  direction: 'incoming' | 'outgoing'
  action: 'keep' | 'redirect' | 'drop'
  detail: string
  targetId?: string | null
  targetLabel?: string
}

/** 结构调整中一条支持段落的去向（拆分时记录分配到的子特征） */
export interface StructureSupportRow {
  paragraphId: string
  section: string
  sourceFeatureIds: string[]
  sourceFeatureLabels: string[]
  targetChildIndex?: number
}

/** 结构调整时批注的迁移/留存去向 */
export interface StructureAnnotationRow {
  annotationId: string
  authorName: string
  text: string
  destination: 'migrate' | 'keep'
  detail: string
}

export type StructureOpType = 'merge' | 'split'

export interface StructureRecord {
  id: string
  op: StructureOpType
  claimId: string
  createdAt: string
  summary: string
  sourceFeatureIds: string[]
  targetFeatureIds: string[]
  /** 调整发生时原特征与新特征的快照，保证记录随时可回看 */
  sourceFeatures: Feature[]
  targetFeatures: Feature[]
  supportRows: StructureSupportRow[]
  relationRows: StructureRelationRow[]
  annotationRows: StructureAnnotationRow[]
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
  versions: ClaimVersion[]
  structureRecords: StructureRecord[]
  role: Role
  selectedClaimId: string
  selectedFeatureId: string | null
  activeTab: string
  currentUserRole: Role
}

export interface StructureCycle {
  /** 构成闭环的特征标签（按环上顺序） */
  labels: string[]
  detail: string
}

export interface MergePreview {
  claimId: string
  sourceIds: string[]
  sourceFeatures: Feature[]
  newLabel: string
  newText: string
  ownerRole: Role
  supportIds: string[]
  supportRows: StructureSupportRow[]
  relationRows: StructureRelationRow[]
  annotationRows: StructureAnnotationRow[]
  cycles: StructureCycle[]
  /** 若来源特征不存在或不属于同一条权利要求，给出阻断原因 */
  errors: string[]
}

export interface MergeRequest {
  sourceIds: string[]
  newLabel: string
  newText: string
  ownerRole: Role
}

/** 拆分对话框中单个子特征的编辑草稿 */
export interface SplitChildDraft {
  label: string
  text: string
  parentId: string | null
  referenceIds: string[]
}

export interface SplitIncomingRow {
  kind: 'parent' | 'reference'
  featureId: string
  featureLabel: string
  /** 重定向到第几个子特征 */
  childIndex: number
}

export interface SplitPlan {
  sourceId: string
  claimId: string
  sourceFeature: Feature
  children: SplitChildDraft[]
  /** 原特征每条支持段落分配到的子特征序号，未分配为 -1 */
  supportAssignment: Record<string, number>
  /** 其他特征指向原特征的父子/引用关系，逐项重定向 */
  incoming: SplitIncomingRow[]
  parentCandidateIds: Array<{ id: string; label: string }>
  annotationRows: StructureAnnotationRow[]
  errors: string[]
  cycles: StructureCycle[]
}

export interface SplitRequest {
  sourceId: string
  children: SplitChildDraft[]
  supportAssignment: Record<string, number>
  incoming: SplitIncomingRow[]
}

export interface ValidationIssue {
  id: string
  severity: 'error' | 'warning'
  type: 'cycle' | 'missing-support' | 'orphan-mapping' | 'empty-feature'
  featureId?: string
  title: string
  detail: string
}
