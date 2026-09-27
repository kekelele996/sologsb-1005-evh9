import { Injectable, OnDestroy } from '@angular/core'
import { BehaviorSubject, map, type Observable } from 'rxjs'
import type {
  Annotation, Claim, ClaimVersion, Feature, MergePreview, MergeRequest, Paragraph, Position, Role,
  SplitChildDraft, SplitIncomingRow, SplitPlan, SplitRequest, StructureAnnotationRow, StructureCycle,
  StructureRecord, StructureRelationRow, StructureSupportRow, ValidationIssue, WorkbenchState
} from './models'

const STORAGE_KEY = 'patent-claim-mapping-workbench-v1'
const POSITION_KEY = 'patent-claim-mapping-position-v1'

const initialClaims: Claim[] = [
  { id: 'claim-1', number: 1, title: '一种自适应展柜环境控制装置', independent: true, text: '一种自适应展柜环境控制装置，包括：柜体；环境传感模块，设置于所述柜体内并用于采集温湿度数据；以及控制模块，与所述环境传感模块通信，并根据所述温湿度数据调节所述柜体的微环境。' },
  { id: 'claim-2', number: 2, title: '传感模块的布置方式', independent: false, text: '根据权利要求1所述的装置，其特征在于，所述环境传感模块包括沿所述柜体对角线布置的多个温湿度传感器。' },
  { id: 'claim-3', number: 3, title: '控制模块的调节策略', independent: false, text: '根据权利要求1所述的装置，其特征在于，所述控制模块基于历史数据与当前数据之间的偏差分级调节除湿单元。' }
]
const initialParagraphs: Paragraph[] = [
  { id: 'para-0012', section: '说明书 [0012]', text: '柜体1形成用于陈列文物的封闭空间。环境传感模块2安装于柜体内部，可采集温度、相对湿度等环境数据，并将数据发送至控制模块3。' },
  { id: 'para-0018', section: '说明书 [0018]', text: '在一种实施方式中，多个温湿度传感器沿柜体对角线布置，由此可降低局部气流造成的测量偏差。传感器数量可根据柜体容积设定。' },
  { id: 'para-0024', section: '说明书 [0024]', text: '控制模块可比较当前湿度与预设区间，并结合历史变化趋势生成调节等级。当偏差持续超过阈值时，控制模块启动除湿单元并提高调节频率。' },
  { id: 'para-0031', section: '说明书 [0031]', text: '控制模块与传感模块之间可以采用有线或无线通信。通信链路可周期传输数据，传输周期例如为十秒至五分钟。' },
  { id: 'para-0040', section: '说明书 [0040]', text: '微环境调节包括湿度调节、温度调节及气体交换。控制策略可记录执行结果，用于后续趋势判断。' }
]
const initialFeatures: Feature[] = [
  { id: 'feature-a', claimId: 'claim-1', label: 'A · 柜体', text: '柜体', parentId: null, referenceIds: [], supportIds: ['para-0012'], ownerRole: 'author' },
  { id: 'feature-b', claimId: 'claim-1', label: 'B · 环境传感模块', text: '设置于柜体内，用于采集温湿度数据', parentId: 'feature-a', referenceIds: [], supportIds: ['para-0012', 'para-0018'], ownerRole: 'author' },
  { id: 'feature-c', claimId: 'claim-1', label: 'C · 控制模块通信', text: '与环境传感模块通信', parentId: 'feature-a', referenceIds: ['feature-b'], supportIds: ['para-0012', 'para-0031'], ownerRole: 'author' },
  { id: 'feature-d', claimId: 'claim-1', label: 'D · 调节微环境', text: '根据温湿度数据调节柜体微环境', parentId: null, referenceIds: ['feature-b', 'feature-c'], supportIds: ['para-0024', 'para-0040'], ownerRole: 'author' },
  { id: 'feature-e', claimId: 'claim-2', label: 'E · 对角线布置', text: '多个温湿度传感器沿柜体对角线布置', parentId: null, referenceIds: [], supportIds: ['para-0018'], ownerRole: 'author' },
  { id: 'feature-f', claimId: 'claim-3', label: 'F · 分级调节', text: '基于历史数据与当前数据的偏差分级调节除湿单元', parentId: null, referenceIds: [], supportIds: ['para-0024'], ownerRole: 'author' }
]
const initialAnnotations: Annotation[] = [
  { id: 'annotation-1', featureId: 'feature-b', authorRole: 'examiner', authorName: '审查员 · 李岚', text: '“温湿度数据”是否包括露点等派生数据？建议在从属权利要求中限定。', updatedAt: '2026-09-24T03:10:00.000Z' },
  { id: 'annotation-2', featureId: 'feature-d', authorRole: 'author', authorName: '代理人 · 陈昊', text: '[0024] 已支持分级调节，发布前补充除湿单元与通信模块的连接关系。', updatedAt: '2026-09-24T04:05:00.000Z' }
]
function demoState(): WorkbenchState {
  return {
    claims: initialClaims, paragraphs: initialParagraphs, features: initialFeatures,
    annotations: initialAnnotations, orphanMappings: [], versions: [], structureRecords: [],
    role: 'author', currentUserRole: 'author', selectedClaimId: 'claim-1', selectedFeatureId: 'feature-b', activeTab: 'mapping'
  }
}
function clone<T>(value: T): T { return structuredClone(value) }

/** 归一化旧版本本地数据：补齐结构调整字段、历史特征状态 */
function normalizeState(state: WorkbenchState): WorkbenchState {
  if (!Array.isArray(state.structureRecords)) state.structureRecords = []
  state.features.forEach(feature => { if (!feature.status) feature.status = 'active' })
  return state
}

@Injectable({ providedIn: 'root' })
export class WorkbenchService implements OnDestroy {
  private readonly initialState = this.loadState()
  private readonly stateSubject = new BehaviorSubject<WorkbenchState>(this.initialState)
  private readonly historySubject = new BehaviorSubject<{ past: number; future: number }>({ past: 0, future: 0 })
  private past: WorkbenchState[] = []
  private future: WorkbenchState[] = []

  readonly state$ = this.stateSubject.asObservable()
  readonly history$ = this.historySubject.asObservable()
  readonly claims$ = this.state$.pipe(map(state => state.claims))
  readonly paragraphs$ = this.state$.pipe(map(state => state.paragraphs))
  readonly features$ = this.state$.pipe(map(state => state.features))
  readonly annotations$ = this.state$.pipe(map(state => state.annotations))
  readonly role$ = this.state$.pipe(map(state => state.role))
  readonly selectedClaim$ = this.state$.pipe(map(state => state.claims.find(claim => claim.id === state.selectedClaimId) || state.claims[0]))
  readonly selectedFeature$ = this.state$.pipe(map(state => state.features.find(feature => feature.id === state.selectedFeatureId) || null))
  readonly issues$ = this.state$.pipe(map(state => this.validate(state)))

  constructor() {
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => this.savePosition())
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', () => this.savePosition())
  }

  get snapshot(): WorkbenchState { return clone(this.stateSubject.value) }
  get canUndo(): boolean { return this.past.length > 0 }
  get canRedo(): boolean { return this.future.length > 0 }

  selectClaim(id: string): void {
    this.patchState(state => { state.selectedClaimId = id; state.selectedFeatureId = state.features.find(feature => feature.claimId === id)?.id || null })
    this.savePosition()
  }

  selectFeature(id: string | null): void {
    this.patchState(state => { state.selectedFeatureId = id })
    this.savePosition()
  }

  setRole(role: Role): void {
    this.patchState(state => { state.role = role; state.currentUserRole = role })
  }

  setTab(tab: string): void {
    this.patchState(state => { state.activeTab = tab })
    this.savePosition()
  }

  updateClaim(patch: Partial<Claim>): void {
    this.commit(state => {
      const claim = state.claims.find(item => item.id === state.selectedClaimId)
      if (claim) Object.assign(claim, patch)
    })
  }

  addClaim(): void {
    this.commit(state => {
      const number = Math.max(0, ...state.claims.map(claim => claim.number)) + 1
      const claim: Claim = { id: `claim-${Date.now()}`, number, title: `权利要求 ${number}`, independent: false, text: '请录入权利要求正文。' }
      state.claims.push(claim)
      state.selectedClaimId = claim.id
      state.selectedFeatureId = null
    })
  }

  addParagraph(): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const next = state.paragraphs.length + 1
      state.paragraphs.push({ id: `para-${Date.now()}`, section: `说明书 [${String(next * 5).padStart(4, '0')}]`, text: '' })
    })
  }

  updateParagraph(id: string, patch: Partial<Paragraph>): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const paragraph = state.paragraphs.find(item => item.id === id)
      if (paragraph) Object.assign(paragraph, patch)
    })
  }

  deleteParagraph(id: string): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      state.paragraphs = state.paragraphs.filter(item => item.id !== id)
      state.features.forEach(feature => { feature.supportIds = feature.supportIds.filter(paragraphId => paragraphId !== id) })
      state.orphanMappings = state.orphanMappings.filter(item => item.paragraphId !== id)
    })
  }

  addFeature(): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const feature: Feature = {
        id: `feature-${Date.now()}`, claimId: state.selectedClaimId,
        label: `新特征 ${state.features.filter(item => item.claimId === state.selectedClaimId).length + 1}`,
        text: '', parentId: null, referenceIds: [], supportIds: [], ownerRole: state.role
      }
      state.features.push(feature)
      state.selectedFeatureId = feature.id
    })
  }

  updateFeature(id: string, patch: Partial<Feature>): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const feature = state.features.find(item => item.id === id)
      if (feature && feature.status !== 'history') Object.assign(feature, patch)
    })
  }

  deleteFeature(id: string): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const feature = state.features.find(item => item.id === id)
      if (!feature) return
      feature.supportIds.forEach(paragraphId => state.orphanMappings.push({
        id: `orphan-${Date.now()}-${paragraphId}`, featureLabel: feature.label, paragraphId,
        reason: `技术特征“${feature.label}”已删除，但支持段落映射仍被保留。`
      }))
      state.features = state.features.filter(item => item.id !== id)
      state.features.forEach(item => {
        item.referenceIds = item.referenceIds.filter(refId => refId !== id)
        if (item.parentId === id) item.parentId = null
      })
      state.annotations = state.annotations.filter(item => item.featureId !== id)
      state.selectedFeatureId = state.features.find(item => item.claimId === state.selectedClaimId)?.id || null
    })
  }

  toggleParagraphMapping(featureId: string, paragraphId: string): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const feature = state.features.find(item => item.id === featureId)
      if (!feature || feature.status === 'history') return
      const index = feature.supportIds.indexOf(paragraphId)
      if (index >= 0) feature.supportIds.splice(index, 1)
      else feature.supportIds.push(paragraphId)
      state.orphanMappings = state.orphanMappings.filter(item => item.paragraphId !== paragraphId)
    })
  }

  clearOrphan(id: string): void {
    this.commit(state => { state.orphanMappings = state.orphanMappings.filter(item => item.id !== id) })
  }

  addAnnotation(featureId: string, text: string): void {
    const trimmed = text.trim()
    if (!trimmed) return
    const role = this.stateSubject.value.role
    const names: Record<Role, string> = { author: '代理人 · 陈昊', examiner: '审查员 · 李岚', viewer: '观察者' }
    this.commit(state => state.annotations.push({
      id: `annotation-${Date.now()}`, featureId, authorRole: role, authorName: names[role], text: trimmed, updatedAt: new Date().toISOString()
    }))
  }

  updateAnnotation(id: string, text: string): void {
    this.commit(state => {
      const annotation = state.annotations.find(item => item.id === id)
      if (annotation && annotation.authorRole === state.role) annotation.text = text
    })
  }

  deleteAnnotation(id: string): void {
    this.commit(state => {
      const annotation = state.annotations.find(item => item.id === id)
      if (annotation && annotation.authorRole === state.role) state.annotations = state.annotations.filter(item => item.id !== id)
    })
  }

  createVersion(name?: string): void {
    this.commit(state => {
      state.versions.unshift({
        id: `version-${Date.now()}`, name: name?.trim() || `快照 ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
        createdAt: new Date().toISOString(), claims: clone(state.claims), features: clone(state.features)
      })
    })
  }

  restoreVersion(id: string): void {
    this.commit(state => {
      const version = state.versions.find(item => item.id === id)
      if (!version) return
      const restoredFeatures = clone(version.features).map(feature => ({ ...feature, status: 'active' as const }))
      // 恢复快照时，快照内不存在但作为历史留存的特征继续保留为历史
      const restoredIds = new Set(restoredFeatures.map(feature => feature.id))
      const retainedHistory = state.features.filter(feature => feature.status === 'history' && !restoredIds.has(feature.id))
      state.claims = clone(version.claims)
      state.features = [...restoredFeatures, ...retainedHistory]
      if (!state.claims.some(claim => claim.id === state.selectedClaimId)) state.selectedClaimId = state.claims[0]?.id || ''
      const selectedStillActive = restoredFeatures.some(feature => feature.id === state.selectedFeatureId)
      state.selectedFeatureId = selectedStillActive
        ? state.selectedFeatureId
        : restoredFeatures.find(feature => feature.claimId === state.selectedClaimId)?.id || null
    })
  }

  undo(): void {
    const previous = this.past.pop()
    if (!previous) return
    this.future.push(clone(this.stateSubject.value))
    this.stateSubject.next(previous)
    this.updateHistory()
    this.saveState()
  }

  redo(): void {
    const next = this.future.pop()
    if (!next) return
    this.past.push(clone(this.stateSubject.value))
    this.stateSubject.next(next)
    this.updateHistory()
    this.saveState()
  }

  savePosition(): void {
    if (typeof localStorage === 'undefined') return
    const state = this.stateSubject.value
    const position: Position = { tab: state.activeTab, claimId: state.selectedClaimId, featureId: state.selectedFeatureId, scrollY: window.scrollY }
    localStorage.setItem(POSITION_KEY, JSON.stringify(position))
    this.saveState()
  }

  readPosition(): Position {
    if (typeof localStorage === 'undefined') return { tab: this.initialState.activeTab, claimId: this.initialState.selectedClaimId, featureId: this.initialState.selectedFeatureId, scrollY: 0 }
    try { return { ...JSON.parse(localStorage.getItem(POSITION_KEY) || '{}'), ...this.stateSubject.value } } catch { return { tab: 'mapping', claimId: this.initialState.selectedClaimId, featureId: this.initialState.selectedFeatureId, scrollY: 0 } }
  }

  exportJson(): string { return JSON.stringify({ ...this.snapshot, validationIssues: this.validate(this.stateSubject.value) }, null, 2) }

  exportCsv(): string {
    const state = this.stateSubject.value
    const rows = state.features.filter(feature => feature.status !== 'history').map(feature => [
      state.claims.find(claim => claim.id === feature.claimId)?.number || '', feature.label, feature.text,
      state.features.find(item => item.id === feature.parentId)?.label || '',
      feature.referenceIds.map(id => state.features.find(item => item.id === id)?.label || id).join('；'),
      feature.supportIds.map(id => state.paragraphs.find(item => item.id === id)?.section || id).join('；')
    ])
    const csv = [['权利要求', '技术特征', '特征内容', '父级特征', '引用特征', '支持段落'], ...rows]
      .map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    return `\uFEFF${csv}`
  }

  // ===== 结构调整：合并 / 拆分 =====

  /** 勾选同一权利要求下的多个特征后，生成合并预览（正文、依据、关联、批注去向） */
  buildMergePreview(sourceIds: string[]): MergePreview {
    const state = this.stateSubject.value
    const sources = sourceIds
      .map(id => state.features.find(feature => feature.id === id))
      .filter((feature): feature is Feature => !!feature && feature.status !== 'history')
    const letters = sources.map(feature => feature.label.split('·')[0].trim()).join('+')
    const suggestedLabel = sources.length ? `${letters} · 合并特征` : ''
    const suggestedText = sources.map(feature => feature.text.trim()).filter(Boolean).join('；')
    return this.simulateMerge({
      sourceIds: sourceIds.slice(),
      newLabel: suggestedLabel,
      newText: suggestedText,
      ownerRole: sources[0]?.ownerRole ?? state.role
    })
  }

  /** 合并预览随草稿（新名称/新正文）变化时刷新 */
  refreshMergePreview(preview: MergePreview, draft: Partial<MergeRequest>): MergePreview {
    return this.simulateMerge({
      sourceIds: preview.sourceIds.slice(),
      newLabel: draft.newLabel ?? preview.newLabel,
      newText: draft.newText ?? preview.newText,
      ownerRole: draft.ownerRole ?? preview.ownerRole
    })
  }

  /** 确认合并：生成新特征，原特征标记为历史，记录结构变更 */
  confirmMerge(request: MergeRequest): { ok: boolean; preview: MergePreview; newFeatureId?: string } {
    if (this.stateSubject.value.role === 'viewer') return { ok: false, preview: this.simulateMerge(request) }
    const preview = this.simulateMerge(request)
    if (preview.errors.length || preview.cycles.length) return { ok: false, preview }

    let newFeatureId: string | undefined
    this.commit(state => {
      const newId = this.nextId('feature')
      newFeatureId = newId
      const sources = state.features.filter(feature => preview.sourceIds.includes(feature.id))
      const newFeature: Feature = {
        id: newId, claimId: sources[0].claimId,
        label: request.newLabel.trim(), text: request.newText.trim(),
        parentId: preview.relationRows.some(row => row.type === 'parent' && row.action === 'keep') ? this.mergeResolvedParent(sources, state.features) : null,
        referenceIds: this.mergeResolvedReferences(sources, state.features),
        supportIds: preview.supportIds.slice(), ownerRole: request.ownerRole, status: 'active'
      }
      state.features.forEach(feature => {
        if (preview.sourceIds.includes(feature.id)) return
        if (feature.parentId && preview.sourceIds.includes(feature.parentId)) feature.parentId = newId
        if (feature.referenceIds.some(id => preview.sourceIds.includes(id))) {
          feature.referenceIds = Array.from(new Set(feature.referenceIds.map(id => preview.sourceIds.includes(id) ? newId : id))).filter(id => id !== feature.id)
        }
      })
      sources.forEach(feature => { feature.status = 'history' })
      state.annotations.forEach(annotation => { if (preview.sourceIds.includes(annotation.featureId)) annotation.featureId = newId })
      state.features.push(newFeature)

      const targetLabel = newFeature.label
      const relationRows = this.mergeRelationRows(sources, state.features, newId, targetLabel)
      state.structureRecords.unshift({
        id: this.nextId('structure'),
        op: 'merge', claimId: newFeature.claimId, createdAt: new Date().toISOString(),
        summary: `合并 ${sources.length} 个特征为“${targetLabel}”，原特征留存为历史`,
        sourceFeatureIds: sources.map(feature => feature.id), targetFeatureIds: [newId],
        sourceFeatures: clone(sources), targetFeatures: [clone(newFeature)],
        supportRows: clone(preview.supportRows), relationRows, annotationRows: clone(preview.annotationRows.map(row => ({ ...row, detail: `批注迁移到新特征“${targetLabel}”` })))
      })
      state.selectedClaimId = newFeature.claimId
      state.selectedFeatureId = newId
    })
    return { ok: true, preview, newFeatureId }
  }

  /** 单条特征拆分：生成拆分计划草稿（支持段落逐项分配、入关系逐项重定向） */
  buildSplitPlan(sourceId: string): SplitPlan | null {
    const state = this.stateSubject.value
    const source = state.features.find(feature => feature.id === sourceId && feature.status !== 'history')
    if (!source) return null
    const parentCandidates = state.features.filter(feature => feature.claimId === source.claimId && feature.id !== source.id && feature.status !== 'history')
    const parentCandidateIds = parentCandidates.map(feature => ({ id: feature.id, label: feature.label }))
    const inheritedParent = source.parentId && parentCandidates.some(feature => feature.id === source.parentId) ? source.parentId : null
    const children: SplitChildDraft[] = [
      { label: `${source.label.split('·')[0].trim()} · 子特征 1`, text: '', parentId: inheritedParent, referenceIds: [] },
      { label: `${source.label.split('·')[0].trim()} · 子特征 2`, text: '', parentId: this.childToken(0), referenceIds: [] }
    ]
    const incoming: SplitIncomingRow[] = state.features
      .filter(feature => feature.status !== 'history' && feature.id !== source.id && (feature.parentId === source.id || feature.referenceIds.includes(source.id)))
      .flatMap<SplitIncomingRow>(feature => {
        const rows: SplitIncomingRow[] = []
        if (feature.parentId === source.id) rows.push({ kind: 'parent', featureId: feature.id, featureLabel: feature.label, childIndex: 0 })
        if (feature.referenceIds.includes(source.id)) rows.push({ kind: 'reference', featureId: feature.id, featureLabel: feature.label, childIndex: 0 })
        return rows
      })
    const annotationRows: StructureAnnotationRow[] = state.annotations
      .filter(annotation => annotation.featureId === source.id)
      .map(annotation => ({ annotationId: annotation.id, authorName: annotation.authorName, text: annotation.text, destination: 'keep', detail: '批注随原特征保留在历史中，可在结构记录中回看' }))
    const supportAssignment: Record<string, number> = {}
    source.supportIds.forEach(id => { supportAssignment[id] = -1 })
    const plan: SplitPlan = {
      sourceId, claimId: source.claimId, sourceFeature: clone(source), children,
      supportAssignment, incoming, parentCandidateIds, annotationRows, errors: [], cycles: []
    }
    return this.recheckSplit(plan)
  }

  /** 拆分草稿变化时重新校验（段落分完、无循环才能提交） */
  recheckSplit(plan: SplitPlan): SplitPlan {
    const errors: string[] = []
    const state = this.stateSubject.value
    const source = state.features.find(feature => feature.id === plan.sourceId && feature.status !== 'history')
    if (!source) { errors.push('原特征不存在或已归档。'); return { ...plan, errors, cycles: [] } }
    if (plan.children.length < 2) errors.push('至少拆分为 2 个子特征。')
    plan.children.forEach((child, index) => {
      if (!child.label.trim()) errors.push(`子特征 ${index + 1} 名称未填写。`)
      if (!child.text.trim()) errors.push(`子特征 ${index + 1} 正文未填写。`)
    })
    const labels = plan.children.map(child => child.label.trim())
    if (new Set(labels).size !== labels.length) errors.push('子特征名称存在重复。')

    const unassigned = source.supportIds.filter(id => (plan.supportAssignment[id] ?? -1) < 0)
    if (unassigned.length) errors.push(`支持段落尚未全部分配（${unassigned.length} 段未分完），请逐项分配后再确认。`)

    plan.incoming.forEach(row => {
      if (row.childIndex < 0 || row.childIndex >= plan.children.length) errors.push(`“${row.featureLabel}”指向原特征的${row.kind === 'parent' ? '父子' : '引用'}关系尚未选择去向子特征。`)
    })

    const tokenOf = (index: number) => this.childToken(index)
    const childIdByToken = new Map(plan.children.map((_, index) => [tokenOf(index), index]))
    plan.children.forEach((child, index) => {
      if (child.parentId === source.id) errors.push(`子特征 ${index + 1} 的父级不能指向原特征（原特征将归档为历史）。`)
      const badParent = child.parentId !== null && child.parentId !== source.id && !childIdByToken.has(child.parentId) && !plan.parentCandidateIds.some(item => item.id === child.parentId)
      if (badParent) errors.push(`子特征 ${index + 1} 的父级指向了不可用的特征。`)
      child.referenceIds.forEach(refId => {
        if (refId === source.id) errors.push(`子特征 ${index + 1} 引用了原特征，原特征将归档，请改引其他子特征或外部特征。`)
        else if (!childIdByToken.has(refId) && !state.features.some(feature => feature.id === refId && feature.status !== 'history')) errors.push(`子特征 ${index + 1} 引用了不可用的特征。`)
      })
    })

    const cycles = this.detectSplitCycles(source, plan)
    if (cycles.length) errors.push('拆分后的引用或层级形成循环，已中止。请调整涉及特征的父子/引用关系。')
    return { ...plan, errors, cycles }
  }

  /** 确认拆分：原特征归档为历史，按分配生成多个子特征 */
  confirmSplit(request: SplitRequest): { ok: boolean; plan: SplitPlan; newFeatureIds?: string[] } {
    const invalid = (): { ok: false; plan: SplitPlan } => ({
      ok: false,
      plan: this.recheckSplit({ sourceId: request.sourceId, claimId: '', sourceFeature: {} as Feature, children: request.children, supportAssignment: request.supportAssignment, incoming: request.incoming, parentCandidateIds: [], annotationRows: [], errors: ['原特征不存在或已归档。'], cycles: [] })
    })
    if (this.stateSubject.value.role === 'viewer') return invalid()
    const draftPlan = this.buildSplitPlan(request.sourceId)
    if (!draftPlan) return invalid()
    const plan = this.recheckSplit({ ...draftPlan, children: request.children, supportAssignment: request.supportAssignment, incoming: request.incoming })
    if (plan.errors.length || plan.cycles.length) return { ok: false, plan }

    let newIds: string[] = []
    this.commit(state => {
      const source = state.features.find(feature => feature.id === request.sourceId)!
      const claimId = source.claimId
      const ids = request.children.map(() => this.nextId('feature'))
      newIds = ids
      const resolveToken = (id: string | null): string | null => {
        if (id === null) return null
        const index = this.childIndexOf(id)
        return index === null ? id : ids[index]
      }
      const newFeatures: Feature[] = request.children.map((child, index) => ({
        id: ids[index], claimId, label: child.label.trim(), text: child.text.trim(),
        parentId: resolveToken(child.parentId === source.id ? null : child.parentId),
        referenceIds: Array.from(new Set(child.referenceIds.map(resolveToken).filter((id): id is string => !!id))).filter(id => id !== ids[index]),
        supportIds: source.supportIds.filter(paragraphId => Number(request.supportAssignment[paragraphId]) === index),
        ownerRole: source.ownerRole, status: 'active'
      }))
      state.features.forEach(feature => {
        if (feature.id === source.id || feature.status === 'history') return
        const parentRow = request.incoming.find(row => row.kind === 'parent' && row.featureId === feature.id)
        if (parentRow && feature.parentId === source.id) feature.parentId = ids[parentRow.childIndex]
        if (feature.referenceIds.includes(source.id)) {
          const refRows = request.incoming.filter(row => row.kind === 'reference' && row.featureId === feature.id)
          feature.referenceIds = Array.from(new Set(feature.referenceIds.flatMap(id => {
            if (id !== source.id) return [id]
            return refRows.map(row => ids[row.childIndex])
          }))).filter(id => id !== feature.id)
        }
      })
      source.status = 'history'
      state.features.push(...newFeatures)

      const labelOf = (id: string | null | undefined): string => {
        if (!id) return '顶层特征'
        const index = this.childIndexOf(id)
        if (index !== null) return newFeatures[index]?.label || `子特征 ${index + 1}`
        return state.features.find(feature => feature.id === id)?.label || id
      }
      const relationRows: StructureRelationRow[] = []
      newFeatures.forEach((feature, index) => {
        relationRows.push({ type: 'parent', featureId: feature.id, featureLabel: feature.label, direction: 'outgoing', action: 'keep', detail: `父级为“${labelOf(feature.parentId)}”`, targetId: feature.parentId, targetLabel: labelOf(feature.parentId) })
        feature.referenceIds.forEach(refId => relationRows.push({ type: 'reference', featureId: feature.id, featureLabel: feature.label, direction: 'outgoing', action: 'keep', detail: `引用“${labelOf(refId)}”`, targetId: refId, targetLabel: labelOf(refId) }))
      })
      request.incoming.forEach(row => {
        const child = newFeatures[row.childIndex]
        relationRows.push({ type: row.kind, featureId: row.featureId, featureLabel: row.featureLabel, direction: 'incoming', action: 'redirect', detail: `“${row.featureLabel}”的${row.kind === 'parent' ? '父级指向' : '引用'}重定向到“${child.label}”`, targetId: child.id, targetLabel: child.label })
      })
      const supportRows: StructureSupportRow[] = source.supportIds.map(paragraphId => ({
        paragraphId,
        section: state.paragraphs.find(paragraph => paragraph.id === paragraphId)?.section || paragraphId,
        sourceFeatureIds: [source.id], sourceFeatureLabels: [source.label],
        targetChildIndex: Number(request.supportAssignment[paragraphId])
      }))
      state.structureRecords.unshift({
        id: this.nextId('structure'),
        op: 'split', claimId, createdAt: new Date().toISOString(),
        summary: `将“${source.label}”拆分为 ${newFeatures.length} 个子特征，原特征留存为历史`,
        sourceFeatureIds: [source.id], targetFeatureIds: ids,
        sourceFeatures: [clone(source)], targetFeatures: clone(newFeatures),
        supportRows, relationRows, annotationRows: clone(plan.annotationRows)
      })
      state.selectedClaimId = claimId
      state.selectedFeatureId = ids[0]
    })
    return { ok: true, plan, newFeatureIds: newIds }
  }

  addSplitChild(plan: SplitPlan): SplitPlan {
    const index = plan.children.length
    const prefix = plan.sourceFeature.label.split('·')[0].trim()
    return this.recheckSplit({
      ...plan,
      children: [...plan.children, { label: `${prefix} · 子特征 ${index + 1}`, text: '', parentId: this.childToken(0), referenceIds: [] }]
    })
  }

  removeSplitChild(plan: SplitPlan, index: number): SplitPlan {
    if (plan.children.length <= 2) return plan
    const remapToken = (id: string | null): string | null => {
      if (id === null) return null
      const tokenIndex = this.childIndexOf(id)
      if (tokenIndex === null) return id
      if (tokenIndex === index) return this.childToken(0)
      return this.childToken(tokenIndex > index ? tokenIndex - 1 : tokenIndex)
    }
    const children = plan.children
      .filter((_, i) => i !== index)
      .map(child => ({ ...child, parentId: remapToken(child.parentId), referenceIds: child.referenceIds.map(remapToken).filter((id): id is string => !!id) }))
    const supportAssignment: Record<string, number> = {}
    Object.entries(plan.supportAssignment).forEach(([paragraphId, childIndex]) => {
      supportAssignment[paragraphId] = childIndex === index ? -1 : childIndex > index ? childIndex - 1 : childIndex
    })
    const incoming = plan.incoming.map(row => row.childIndex === index
      ? { ...row, childIndex: -1 }
      : { ...row, childIndex: row.childIndex > index ? row.childIndex - 1 : row.childIndex })
    return this.recheckSplit({ ...plan, children, supportAssignment, incoming })
  }

  private childToken(index: number): string { return `__child_${index}__` }
  private childIndexOf(token: string): number | null {
    const match = /^__child_(\d+)__$/.exec(token)
    return match ? Number(match[1]) : null
  }

  private idCounter = 0
  private nextId(prefix: string): string {
    this.idCounter += 1
    return `${prefix}-${Date.now()}-${this.idCounter}-${Math.random().toString(36).slice(2, 7)}`
  }

  private simulateMerge(request: MergeRequest): MergePreview {
    const state = this.stateSubject.value
    const errors: string[] = []
    const sources = request.sourceIds
      .map(id => state.features.find(feature => feature.id === id))
      .filter((feature): feature is Feature => !!feature && feature.status !== 'history')
    const sourceIds = sources.map(feature => feature.id)
    if (request.sourceIds.length < 2 || sources.length !== request.sourceIds.length) errors.push('请勾选同一条权利要求下至少 2 个有效特征。')
    const claimIds = new Set(sources.map(feature => feature.claimId))
    if (claimIds.size > 1) errors.push('仅支持合并同一条权利要求下的特征。')
    if (!request.newLabel.trim()) errors.push('合并后的新特征名称未填写。')
    if (!request.newText.trim()) errors.push('合并后的新特征正文未填写。')

    const mergedId = '__merged__'
    const supportIds = Array.from(new Set(sources.flatMap(feature => feature.supportIds)))
    const supportRows: StructureSupportRow[] = supportIds.map(paragraphId => {
      const owners = sources.filter(feature => feature.supportIds.includes(paragraphId))
      return {
        paragraphId,
        section: state.paragraphs.find(paragraph => paragraph.id === paragraphId)?.section || paragraphId,
        sourceFeatureIds: owners.map(feature => feature.id),
        sourceFeatureLabels: owners.map(feature => feature.label)
      }
    })
    const annotationRows: StructureAnnotationRow[] = sources
      .flatMap(feature => state.annotations.filter(annotation => annotation.featureId === feature.id))
      .map(annotation => ({ annotationId: annotation.id, authorName: annotation.authorName, text: annotation.text, destination: 'migrate' as const, detail: '批注迁移到新特征' }))

    const relationRows = this.mergeRelationRows(sources, state.features, mergedId, request.newLabel.trim() || '新特征')

    // 模拟合并后的关系图（新特征作为合成节点 __merged__）
    const edges = new Map<string, { parents: string[]; refs: string[] }>()
    const ensure = (id: string) => { if (!edges.has(id)) edges.set(id, { parents: [], refs: [] }); return edges.get(id)! }
    const keptParent = this.mergeResolvedParent(sources, state.features)
    const mergedRefs = this.mergeResolvedReferences(sources, state.features, mergedId)
    ensure(mergedId).parents.push(...(keptParent ? [keptParent] : []))
    ensure(mergedId).refs.push(...mergedRefs)
    state.features.filter(feature => feature.status !== 'history' && !sourceIds.includes(feature.id)).forEach(feature => {
      const node = ensure(feature.id)
      if (feature.parentId) {
        node.parents.push(sourceIds.includes(feature.parentId) ? mergedId : feature.parentId)
      }
      feature.referenceIds.forEach(refId => {
        if (sourceIds.includes(refId)) node.refs.push(mergedId)
        else if (refId !== feature.id) node.refs.push(refId)
      })
    })
    const cycles = this.findCycles(edges, id => id === mergedId ? request.newLabel.trim() || '新特征' : state.features.find(feature => feature.id === id)?.label || id)
    if (cycles.length) errors.push('合并后的引用或层级会形成循环，已中止。请调整涉及特征的父子/引用关系。')

    return {
      claimId: sources[0]?.claimId || state.selectedClaimId,
      sourceIds, sourceFeatures: clone(sources),
      newLabel: request.newLabel.trim(), newText: request.newText.trim(), ownerRole: request.ownerRole,
      supportIds, supportRows, relationRows, annotationRows, cycles, errors
    }
  }

  private mergeResolvedParent(sources: Feature[], features: Feature[]): string | null {
    for (const source of sources) {
      if (source.parentId && !sources.some(item => item.id === source.parentId)) {
        const parent = features.find(feature => feature.id === source.parentId)
        if (parent && parent.status !== 'history') return source.parentId
      }
    }
    return null
  }

  private mergeResolvedReferences(sources: Feature[], features: Feature[], mergedId = '__merged__'): string[] {
    const sourceIds = new Set(sources.map(feature => feature.id))
    return Array.from(new Set(sources.flatMap(feature => feature.referenceIds)
      .filter(id => !sourceIds.has(id) && id !== mergedId && features.some(item => item.id === id && item.status !== 'history'))))
  }

  /** 汇总合并中父子/引用关系的去向（预览与提交共用，保证两处口径一致） */
  private mergeRelationRows(sources: Feature[], features: Feature[], mergedId: string, mergedLabel: string): StructureRelationRow[] {
    const rows: StructureRelationRow[] = []
    const sourceIds = new Set(sources.map(feature => feature.id))
    let parentKept = false
    sources.forEach(source => {
      if (!source.parentId) return
      const parent = features.find(feature => feature.id === source.parentId)
      if (sourceIds.has(source.parentId)) {
        rows.push({ type: 'parent', featureId: source.id, featureLabel: source.label, direction: 'outgoing', action: 'drop', detail: `原父级“${parent?.label || source.parentId}”也在合并范围内，合并后该层级关系取消` })
      } else if (!parentKept && parent && parent.status !== 'history') {
        parentKept = true
        rows.push({ type: 'parent', featureId: source.id, featureLabel: source.label, direction: 'outgoing', action: 'keep', detail: `新特征继承父级“${parent.label}”`, targetId: parent.id, targetLabel: parent.label })
      } else {
        rows.push({ type: 'parent', featureId: source.id, featureLabel: source.label, direction: 'outgoing', action: 'drop', detail: parent?.status === 'history' ? '原父级已归档，合并后不再保留该层级' : '父级与其他来源重复，合并后只保留一条父子关系' })
      }
    })
    const seenRefs = new Set<string>()
    sources.forEach(source => source.referenceIds.forEach(refId => {
      const target = features.find(feature => feature.id === refId)
      if (sourceIds.has(refId)) {
        rows.push({ type: 'reference', featureId: source.id, featureLabel: source.label, direction: 'outgoing', action: 'drop', detail: `引用“${target?.label || refId}”也在合并范围内，内部引用自动消除` })
      } else if (!target || target.status === 'history') {
        rows.push({ type: 'reference', featureId: source.id, featureLabel: source.label, direction: 'outgoing', action: 'drop', detail: `引用“${target?.label || refId}”已归档，合并后移除` })
      } else if (!seenRefs.has(refId)) {
        seenRefs.add(refId)
        rows.push({ type: 'reference', featureId: source.id, featureLabel: source.label, direction: 'outgoing', action: 'keep', detail: `新特征保留对“${target.label}”的引用`, targetId: target.id, targetLabel: target.label })
      } else {
        rows.push({ type: 'reference', featureId: source.id, featureLabel: source.label, direction: 'outgoing', action: 'drop', detail: `对“${target.label}”的引用与其他来源重复，合并后去重` })
      }
    }))
    features.filter(feature => feature.status !== 'history' && !sourceIds.has(feature.id)).forEach(feature => {
      if (feature.parentId && sourceIds.has(feature.parentId)) {
        const parent = sources.find(item => item.id === feature.parentId)
        rows.push({ type: 'parent', featureId: feature.id, featureLabel: feature.label, direction: 'incoming', action: 'redirect', detail: `“${feature.label}”原父级为“${parent?.label || feature.parentId}”，合并后改挂到“${mergedLabel}”`, targetId: mergedId, targetLabel: mergedLabel })
      }
      const incomingSources = feature.referenceIds.filter(id => sourceIds.has(id))
      incomingSources.forEach(refId => {
        const source = sources.find(item => item.id === refId)
        rows.push({ type: 'reference', featureId: feature.id, featureLabel: feature.label, direction: 'incoming', action: 'redirect', detail: `“${feature.label}”原引用“${source?.label || refId}”，合并后改引“${mergedLabel}”${incomingSources.length > 1 ? '（多条入引用自动去重）' : ''}`, targetId: mergedId, targetLabel: mergedLabel })
      })
    })
    return rows
  }

  private detectSplitCycles(source: Feature, plan: SplitPlan): StructureCycle[] {
    const state = this.stateSubject.value
    const edges = new Map<string, { parents: string[]; refs: string[] }>()
    const ensure = (id: string) => { if (!edges.has(id)) edges.set(id, { parents: [], refs: [] }); return edges.get(id)! }
    plan.children.forEach((child, index) => {
      const token = this.childToken(index)
      const node = ensure(token)
      if (child.parentId) node.parents.push(child.parentId)
      node.refs.push(...child.referenceIds)
    })
    state.features.filter(feature => feature.status !== 'history' && feature.id !== source.id).forEach(feature => {
      const node = ensure(feature.id)
      if (feature.parentId) {
        const parentRow = plan.incoming.find(row => row.kind === 'parent' && row.featureId === feature.id)
        if (feature.parentId === source.id && parentRow && parentRow.childIndex >= 0) node.parents.push(this.childToken(parentRow.childIndex))
        else if (feature.parentId !== source.id) node.parents.push(feature.parentId)
      }
      if (feature.referenceIds.includes(source.id)) {
        const refRows = plan.incoming.filter(row => row.kind === 'reference' && row.featureId === feature.id)
        feature.referenceIds.forEach(refId => {
          if (refId !== source.id) node.refs.push(refId)
        })
        refRows.forEach(row => { if (row.childIndex >= 0) node.refs.push(this.childToken(row.childIndex)) })
      } else {
        node.refs.push(...feature.referenceIds)
      }
    })
    const labelOf = (id: string): string => {
      const tokenIndex = this.childIndexOf(id)
      if (tokenIndex !== null) return plan.children[tokenIndex]?.label.trim() || `子特征 ${tokenIndex + 1}`
      return state.features.find(feature => feature.id === id)?.label || id
    }
    return this.findCycles(edges, labelOf)
  }

  /** 三色 DFS：沿父子与引用边查找闭环，返回环上节点标签 */
  private findCycles(edges: Map<string, { parents: string[]; refs: string[] }>, labelOf: (id: string) => string): StructureCycle[] {
    const colors = new Map<string, 0 | 1 | 2>()
    const stack: string[] = []
    const cycles: StructureCycle[] = []
    const seenCycleKeys = new Set<string>()
    const visit = (id: string): void => {
      colors.set(id, 1)
      stack.push(id)
      const node = edges.get(id)
      const neighbors = node ? [...node.parents, ...node.refs] : []
      for (const next of neighbors) {
        const color = colors.get(next) ?? 0
        if (color === 1) {
          const start = stack.indexOf(next)
          const path = stack.slice(start).concat(next)
          const labels = path.map(labelOf)
          const key = labels.slice(0, -1).slice().sort().join('›')
          if (!seenCycleKeys.has(key)) {
            seenCycleKeys.add(key)
            cycles.push({ labels, detail: `循环链路：${labels.join(' → ')}` })
          }
        } else if (color === 0) {
          visit(next)
        }
      }
      stack.pop()
      colors.set(id, 2)
    }
    Array.from(edges.keys()).forEach(id => { if ((colors.get(id) ?? 0) === 0) visit(id) })
    return cycles
  }

  validate(state = this.stateSubject.value): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    for (const feature of state.features.filter(item => item.status !== 'history')) {
      if (!feature.text.trim()) issues.push({ id: `empty-${feature.id}`, severity: 'warning', type: 'empty-feature', featureId: feature.id, title: `${feature.label} 内容为空`, detail: '请补全技术特征文字，避免映射对象不明确。' })
      if (!feature.supportIds.length) issues.push({ id: `support-${feature.id}`, severity: 'error', type: 'missing-support', featureId: feature.id, title: `${feature.label} 缺少说明书依据`, detail: '至少为一个说明书段落建立支持映射。' })
      if (this.hasReferenceCycle(feature, state.features)) issues.push({ id: `cycle-${feature.id}`, severity: 'error', type: 'cycle', featureId: feature.id, title: `${feature.label} 存在循环引用`, detail: '特征层级或引用关系形成闭环，请移除其中一条关系。' })
    }
    state.orphanMappings.forEach(item => issues.push({ id: item.id, severity: 'warning', type: 'orphan-mapping', title: '存在待清理映射', detail: item.reason }))
    return issues
  }

  private hasReferenceCycle(start: Feature, features: Feature[]): boolean {
    const visited = new Set<string>()
    const visit = (id: string): boolean => {
      if (id === start.id && visited.size > 0) return true
      if (visited.has(id)) return false
      visited.add(id)
      const feature = features.find(item => item.id === id)
      if (!feature) return false
      if (feature.parentId && visit(feature.parentId)) return true
      return feature.referenceIds.some(visit)
    }
    return visit(start.id)
  }

  private commit(recipe: (state: WorkbenchState) => void): void {
    const current = clone(this.stateSubject.value)
    const next = clone(current)
    recipe(next)
    this.past.push(current)
    if (this.past.length > 60) this.past.shift()
    this.future = []
    this.stateSubject.next(next)
    this.updateHistory()
    this.saveState()
  }

  private patchState(recipe: (state: WorkbenchState) => void): void {
    const next = clone(this.stateSubject.value)
    recipe(next)
    this.stateSubject.next(next)
    this.saveState()
  }

  private updateHistory(): void { this.historySubject.next({ past: this.past.length, future: this.future.length }) }
  private saveState(): void { if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(this.stateSubject.value)) }
  private loadState(): WorkbenchState {
    if (typeof localStorage === 'undefined') return normalizeState(demoState())
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? normalizeState({ ...demoState(), ...JSON.parse(stored) }) : demoState()
    } catch { return demoState() }
  }
}
