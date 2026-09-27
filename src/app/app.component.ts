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
import type { Annotation, Claim, Feature, MergePreview, Role, SplitPartDraft, ValidationIssue, WorkbenchState } from './models'
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
  mergeSelection = new Set<string>()
  mergeDialog = false
  mergePreview: MergePreview | null = null
  mergeLabel = ''
  splitDialog = false
  splitParts: Array<{ label: string; text: string; referenceIds: string[] }> = []
  splitAssignments: Record<string, number | ''> = {}
  splitError = ''
  activeIssue: ValidationIssue | null = null
  private lastClaimId = ''
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
      if (state.selectedClaimId !== this.lastClaimId) {
        this.lastClaimId = state.selectedClaimId
        this.mergeSelection.clear()
      }
      this.syncVersions()
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
  get claimFeatures(): Feature[] { return this.state.features.filter(item => item.claimId === this.state.selectedClaimId && !item.archived) }
  get archivedFeatures(): Feature[] { return this.state.features.filter(item => item.archived && item.claimId === this.state.selectedClaimId) }
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

  toggleMergeSelect(id: string, checked: boolean): void {
    checked ? this.mergeSelection.add(id) : this.mergeSelection.delete(id)
  }

  openMergePreview(): void {
    const preview = this.service.previewMerge(Array.from(this.mergeSelection))
    if (!preview) return
    this.mergePreview = preview
    this.mergeLabel = `合并特征（${preview.sourceLabels.map(label => label.split('·')[0].trim()).join('＋')}）`
    this.mergeDialog = true
  }

  confirmMerge(): void {
    if (!this.mergePreview) return
    this.service.mergeFeatures(this.mergePreview.sourceIds, this.mergeLabel)
    this.mergeSelection.clear()
    this.mergeDialog = false
    this.mergePreview = null
  }

  openSplitDialog(): void {
    if (!this.selectedFeature) return
    this.splitParts = [
      { label: `${this.selectedFeature.label}（一）`, text: '', referenceIds: [] },
      { label: `${this.selectedFeature.label}（二）`, text: '', referenceIds: [] }
    ]
    this.splitAssignments = {}
    this.splitError = ''
    this.splitDialog = true
  }

  addSplitPart(): void {
    this.splitParts.push({ label: `子特征 ${this.splitParts.length + 1}`, text: '', referenceIds: [] })
  }

  removeSplitPart(index: number): void {
    if (this.splitParts.length <= 2) return
    this.splitParts.splice(index, 1)
    const remap = (token: string): string | null => {
      if (!token.startsWith('part:')) return token
      const partIndex = Number(token.slice(5))
      if (partIndex === index) return null
      return `part:${partIndex > index ? partIndex - 1 : partIndex}`
    }
    this.splitParts.forEach(part => { part.referenceIds = part.referenceIds.map(remap).filter((token): token is string => !!token) })
    for (const key of Object.keys(this.splitAssignments)) {
      const value = this.splitAssignments[key]
      if (value === '') continue
      if (value === index) this.splitAssignments[key] = ''
      else if (value > index) this.splitAssignments[key] = value - 1
    }
  }

  toggleSplitRef(partIndex: number, token: string, checked: boolean): void {
    const refs = this.splitParts[partIndex].referenceIds
    this.splitParts[partIndex].referenceIds = checked ? [...refs, token] : refs.filter(item => item !== token)
  }

  splitRefCandidates(): Feature[] {
    return this.claimFeatures.filter(feature => feature.id !== this.selectedFeature?.id)
  }

  assignmentFor(paragraphId: string): number | '' {
    return paragraphId in this.splitAssignments ? this.splitAssignments[paragraphId] : ''
  }

  confirmSplit(): void {
    const feature = this.selectedFeature
    if (!feature) return
    const drafts: SplitPartDraft[] = this.splitParts.map((part, index) => ({
      label: part.label,
      text: part.text,
      supportIds: Object.entries(this.splitAssignments)
        .filter(([, partIndex]) => partIndex !== '' && Number(partIndex) === index)
        .map(([paragraphId]) => paragraphId),
      referenceIds: part.referenceIds
    }))
    const error = this.service.splitFeature(feature.id, drafts)
    if (error) {
      this.splitError = error
      return
    }
    this.splitDialog = false
  }

  annotationCount(featureId: string): number {
    return this.state.annotations.filter(item => item.featureId === featureId).length
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
