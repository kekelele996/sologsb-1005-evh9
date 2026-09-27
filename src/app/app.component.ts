import { AfterViewInit, Component, OnDestroy, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { TextareaModule } from 'primeng/textarea'
import { SelectModule } from 'primeng/select'
import { CardModule } from 'primeng/card'
import { BadgeModule } from 'primeng/badge'
import { DialogModule } from 'primeng/dialog'
import { TooltipModule } from 'primeng/tooltip'
import { Subscription } from 'rxjs'
import type {
  Annotation, Claim, Feature, MergePreview, Role, SplitIncomingRow, SplitPlan,
  StructureRecord, ValidationIssue, WorkbenchState
} from './models'
import { WorkbenchService } from './workbench.service'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, TextareaModule, SelectModule, CardModule, BadgeModule, DialogModule, TooltipModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  state: WorkbenchState
  issues: ValidationIssue[] = []
  history = { past: 0, future: 0 }
  compareA = ''
  compareB = ''
  annotationDraft = ''
  versionDialog = false
  versionName = ''
  activeIssue: ValidationIssue | null = null

  // 结构调整：勾选、合并预览对话框、拆分对话框
  checkedFeatureIds = new Set<string>()
  mergeDialog = false
  mergePreview: MergePreview | null = null
  mergeDraftLabel = ''
  mergeDraftText = ''
  splitDialog = false
  splitPlan: SplitPlan | null = null
  expandedRecordIds = new Set<string>()
  roleOptions: Array<{ label: string; value: Role }> = [
    { label: '代理人（可编辑主数据与本人批注）', value: 'author' },
    { label: '审查员（可编辑本人批注）', value: 'examiner' },
    { label: '观察者（只读）', value: 'viewer' }
  ]
  private subscriptions = new Subscription()

  constructor(readonly service: WorkbenchService) {
    this.state = service.snapshot
  }

  ngOnInit(): void {
    this.subscriptions.add(this.service.state$.subscribe(state => {
      this.state = structuredClone(state)
      this.syncVersions()
      this.syncCheckedFeatures()
      if (this.mergePreview) this.mergePreview = this.service.refreshMergePreview(this.mergePreview, { newLabel: this.mergeDraftLabel, newText: this.mergeDraftText })
      if (this.splitPlan) this.splitPlan = this.service.recheckSplit(this.splitPlan)
    }))
    this.subscriptions.add(this.service.issues$.subscribe(issues => this.issues = issues))
    this.subscriptions.add(this.service.history$.subscribe(history => this.history = history))
    window.addEventListener('keydown', this.handleKeyboard)
  }

  ngAfterViewInit(): void {
    const position = this.service.readPosition()
    setTimeout(() => window.scrollTo({ top: position.scrollY || 0, behavior: 'instant' as ScrollBehavior }), 0)
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
    window.removeEventListener('keydown', this.handleKeyboard)
  }

  get selectedClaim(): Claim | undefined { return this.state.claims.find(item => item.id === this.state.selectedClaimId) }
  get selectedFeature(): Feature | undefined { return this.state.features.find(item => item.id === this.state.selectedFeatureId) }
  get claimFeatures(): Feature[] { return this.state.features.filter(item => item.claimId === this.state.selectedClaimId && item.status !== 'history') }
  get claimHistoryFeatures(): Feature[] { return this.state.features.filter(item => item.claimId === this.state.selectedClaimId && item.status === 'history') }
  get checkedFeatures(): Feature[] { return this.claimFeatures.filter(feature => this.checkedFeatureIds.has(feature.id)) }
  get claimStructureRecords(): StructureRecord[] { return this.state.structureRecords.filter(record => record.claimId === this.state.selectedClaimId) }
  get featureAnnotations(): Annotation[] { return this.selectedFeature ? this.state.annotations.filter(item => item.featureId === this.selectedFeature?.id) : [] }
  get currentRoleLabel(): string { return this.roleOptions.find(item => item.value === this.state.role)?.label || '' }
  get errorCount(): number { return this.issues.filter(item => item.severity === 'error').length }
  get warningCount(): number { return this.issues.filter(item => item.severity === 'warning').length }
  get canEditMainData(): boolean { return this.state.role !== 'viewer' }
  get mappedFeatureCount(): number { return this.claimFeatures.filter(feature => feature.supportIds.length > 0).length }

  claimLabel(id: string): string { return this.state.claims.find(item => item.id === id)?.title || '未命名权利要求' }
  featureLabel(id: string): string { return this.state.features.find(item => item.id === id)?.label || id }
  paragraphLabel(id: string): string { return this.state.paragraphs.find(item => item.id === id)?.section || id }
  isMapped(feature: Feature, paragraphId: string): boolean { return feature.supportIds.includes(paragraphId) }
  isOwnAnnotation(annotation: Annotation): boolean { return annotation.authorRole === this.state.role }
  ownerLabel(role: Role): string { return ({ author: '代理人', examiner: '审查员', viewer: '观察者' })[role] }

  updateClaimField(field: 'title' | 'text' | 'number' | 'independent', event: Event): void {
    const element = event.target as HTMLInputElement
    const value = field === 'number' ? Number(element.value) : field === 'independent' ? element.checked : element.value
    this.service.updateClaim({ [field]: value })
  }

  updateFeatureField(field: 'label' | 'text', event: Event): void {
    if (!this.selectedFeature) return
    this.service.updateFeature(this.selectedFeature.id, { [field]: (event.target as HTMLInputElement | HTMLTextAreaElement).value })
  }

  updateFeatureParent(event: Event): void {
    if (!this.selectedFeature) return
    this.service.updateFeature(this.selectedFeature.id, { parentId: (event.target as HTMLSelectElement).value || null })
  }

  toggleReference(featureId: string, checked: boolean): void {
    if (!this.selectedFeature) return
    const ids = checked
      ? Array.from(new Set([...this.selectedFeature.referenceIds, featureId]))
      : this.selectedFeature.referenceIds.filter(id => id !== featureId)
    this.service.updateFeature(this.selectedFeature.id, { referenceIds: ids })
  }

  addAnnotation(): void {
    if (!this.selectedFeature) return
    this.service.addAnnotation(this.selectedFeature.id, this.annotationDraft)
    this.annotationDraft = ''
  }

  updateAnnotation(annotation: Annotation, event: Event): void {
    this.service.updateAnnotation(annotation.id, (event.target as HTMLTextAreaElement).value)
  }

  createVersion(): void {
    this.service.createVersion(this.versionName)
    this.versionName = ''
    this.versionDialog = false
  }

  restoreVersion(id: string): void {
    this.service.restoreVersion(id)
  }

  getVersion(id: string) { return this.state.versions.find(item => item.id === id) }
  compareRows(): Array<{ label: string; before: string; after: string; changed: boolean }> {
    const a = this.getVersion(this.compareA)
    const b = this.getVersion(this.compareB)
    if (!a || !b) return []
    const ids = Array.from(new Set([...a.claims.map(item => item.id), ...b.claims.map(item => item.id)]))
    return ids.map(id => {
      const before = a.claims.find(item => item.id === id)?.text || ''
      const after = b.claims.find(item => item.id === id)?.text || ''
      return { label: `权利要求 ${a.claims.find(item => item.id === id)?.number || b.claims.find(item => item.id === id)?.number || '?'}`, before, after, changed: before !== after }
    })
  }

  exportFile(type: 'json' | 'csv'): void {
    const content = type === 'json' ? this.service.exportJson() : this.service.exportCsv()
    const mime = type === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8'
    const url = URL.createObjectURL(new Blob([content], { type: mime }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `patent-claim-check-${new Date().toISOString().slice(0, 10)}.${type}`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  locateIssue(issue: ValidationIssue): void {
    this.activeIssue = issue
    if (issue.featureId) this.service.selectFeature(issue.featureId)
    this.service.setTab('mapping')
  }

  closeIssue(): void { this.activeIssue = null }

  // ===== 结构调整：勾选 / 合并 / 拆分 =====

  private syncCheckedFeatures(): void {
    const visibleIds = new Set(this.claimFeatures.map(feature => feature.id))
    this.checkedFeatureIds = new Set(Array.from(this.checkedFeatureIds).filter(id => visibleIds.has(id)))
  }

  toggleFeatureCheck(featureId: string, checked: boolean): void {
    if (checked) this.checkedFeatureIds.add(featureId)
    else this.checkedFeatureIds.delete(featureId)
  }

  get canOpenMerge(): boolean { return this.canEditMainData && this.checkedFeatures.length >= 2 }
  get canOpenSplit(): boolean { return this.canEditMainData && this.checkedFeatures.length === 1 }

  openMergePreview(): void {
    const ids = this.checkedFeatures.map(feature => feature.id)
    if (ids.length < 2) return
    this.mergePreview = this.service.buildMergePreview(ids)
    this.mergeDraftLabel = this.mergePreview.newLabel
    this.mergeDraftText = this.mergePreview.newText
    this.mergeDialog = true
  }

  refreshMergeDraft(): void {
    if (!this.mergePreview) return
    this.mergePreview = this.service.refreshMergePreview(this.mergePreview, { newLabel: this.mergeDraftLabel, newText: this.mergeDraftText })
  }

  confirmMerge(): void {
    if (!this.mergePreview) return
    const result = this.service.confirmMerge({
      sourceIds: this.mergePreview.sourceIds,
      newLabel: this.mergeDraftLabel,
      newText: this.mergeDraftText,
      ownerRole: this.mergePreview.ownerRole
    })
    if (result.ok) {
      this.mergeDialog = false
      this.mergePreview = null
      this.checkedFeatureIds = new Set<string>()
    } else {
      this.mergePreview = result.preview
    }
  }

  cancelMerge(): void {
    this.mergeDialog = false
    this.mergePreview = null
  }

  openSplit(featureId?: string): void {
    const sourceId = featureId || this.checkedFeatures[0]?.id
    if (!sourceId) return
    this.splitPlan = this.service.buildSplitPlan(sourceId)
    if (this.splitPlan) this.splitDialog = true
  }

  cancelSplit(): void {
    this.splitDialog = false
    this.splitPlan = null
  }

  private revalidateSplit(): void {
    if (this.splitPlan) this.splitPlan = this.service.recheckSplit(this.splitPlan)
  }

  get splitParagraphs() {
    if (!this.splitPlan?.sourceFeature?.supportIds) return []
    return this.splitPlan.sourceFeature.supportIds.map(id => ({ id, section: this.paragraphLabel(id) }))
  }

  splitParentOptions(childIndex: number): Array<{ value: string; label: string }> {
    if (!this.splitPlan) return []
    const options: Array<{ value: string; label: string }> = []
    this.splitPlan.parentCandidateIds.forEach(item => options.push({ value: item.id, label: item.label }))
    this.splitPlan.children.forEach((child, index) => {
      if (index !== childIndex) options.push({ value: `__child_${index}__`, label: `${child.label}（拆分后的子特征）` })
    })
    return options
  }

  splitReferenceOptions(childIndex: number): Array<{ value: string; label: string }> {
    if (!this.splitPlan) return []
    const options: Array<{ value: string; label: string }> = []
    this.splitPlan.parentCandidateIds.forEach(item => options.push({ value: item.id, label: item.label }))
    this.splitPlan.children.forEach((child, index) => {
      if (index !== childIndex) options.push({ value: `__child_${index}__`, label: `${child.label}（拆分后的子特征）` })
    })
    return options
  }

  splitChildLabel(token: string): string {
    if (!this.splitPlan) return token
    const match = /^__child_(\d+)__$/.exec(token)
    if (match) return this.splitPlan.children[Number(match[1])]?.label || `子特征 ${Number(match[1]) + 1}`
    return this.featureLabel(token)
  }

  isSplitReferenceChecked(childIndex: number, refId: string): boolean {
    return !!this.splitPlan?.children[childIndex].referenceIds.includes(refId)
  }

  toggleSplitReference(childIndex: number, refId: string, checked: boolean): void {
    if (!this.splitPlan) return
    const refs = this.splitPlan.children[childIndex].referenceIds
    this.splitPlan = {
      ...this.splitPlan,
      children: this.splitPlan.children.map((child, index) => {
        if (index !== childIndex) return child
        return { ...child, referenceIds: checked ? Array.from(new Set([...refs, refId])) : refs.filter(id => id !== refId) }
      })
    }
    this.revalidateSplit()
  }

  updateSplitChild(index: number, patch: Partial<{ label: string; text: string; parentId: string | null }>): void {
    if (!this.splitPlan) return
    this.splitPlan = { ...this.splitPlan, children: this.splitPlan.children.map((child, i) => i === index ? { ...child, ...patch } : child) }
    this.revalidateSplit()
  }

  addSplitChild(): void {
    if (this.splitPlan) this.splitPlan = this.service.addSplitChild(this.splitPlan)
  }

  removeSplitChild(index: number): void {
    if (this.splitPlan) this.splitPlan = this.service.removeSplitChild(this.splitPlan, index)
  }

  assignSupport(paragraphId: string, childIndex: number): void {
    if (!this.splitPlan) return
    this.splitPlan = { ...this.splitPlan, supportAssignment: { ...this.splitPlan.supportAssignment, [paragraphId]: childIndex } }
    this.revalidateSplit()
  }

  setIncomingTarget(row: SplitIncomingRow, childIndex: number): void {
    if (!this.splitPlan) return
    this.splitPlan = { ...this.splitPlan, incoming: this.splitPlan.incoming.map(item => item === row ? { ...item, childIndex } : item) }
    this.revalidateSplit()
  }

  confirmSplit(): void {
    if (!this.splitPlan) return
    const result = this.service.confirmSplit({
      sourceId: this.splitPlan.sourceId,
      children: this.splitPlan.children,
      supportAssignment: this.splitPlan.supportAssignment,
      incoming: this.splitPlan.incoming
    })
    this.splitPlan = result.plan
    if (result.ok) {
      this.splitDialog = false
      this.splitPlan = null
      this.checkedFeatureIds = new Set<string>()
    }
  }

  get splitBlocked(): boolean {
    return !this.canEditMainData || !!this.splitPlan && (this.splitPlan.errors.length > 0 || this.splitPlan.cycles.length > 0)
  }
  get mergeBlocked(): boolean {
    return !this.canEditMainData || !!this.mergePreview && (this.mergePreview.errors.length > 0 || this.mergePreview.cycles.length > 0)
  }

  toggleRecord(id: string): void {
    if (this.expandedRecordIds.has(id)) this.expandedRecordIds.delete(id)
    else this.expandedRecordIds.add(id)
  }

  recordOpLabel(op: 'merge' | 'split'): string { return op === 'merge' ? '合并' : '拆分' }
  recordTargetLabel(record: StructureRecord, index: number): string {
    if (index < 0 || index >= record.targetFeatures.length) return '（未分配）'
    return record.targetFeatures[index]?.label || `新特征 ${index + 1}`
  }
  isRecordExpanded(id: string): boolean { return this.expandedRecordIds.has(id) }

  private syncVersions(): void {
    if (!this.state.versions.some(item => item.id === this.compareA)) this.compareA = this.state.versions[1]?.id || this.state.versions[0]?.id || ''
    if (!this.state.versions.some(item => item.id === this.compareB)) this.compareB = this.state.versions[0]?.id || ''
  }

  private handleKeyboard = (event: KeyboardEvent): void => {
    if (!(event.metaKey || event.ctrlKey)) return
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault()
      event.shiftKey ? this.service.redo() : this.service.undo()
    } else if (event.key.toLowerCase() === 'y') {
      event.preventDefault()
      this.service.redo()
    } else if (event.key.toLowerCase() === 's') {
      event.preventDefault()
      this.versionDialog = true
    }
  }
}
