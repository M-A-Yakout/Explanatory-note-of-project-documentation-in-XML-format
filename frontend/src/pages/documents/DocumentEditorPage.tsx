import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Archive, Check, CircleAlert, History, Loader2, Plus, Trash2 } from 'lucide-react'

import { api, ApiError } from '../../shared/api'
import type { CompositionItem, DocumentData, DocumentDetail, NormRef, SectionKey, TeiRow, ValidationResult } from '../../shared/types'
import { Alert, Button, Checkbox, FormField, Input, Select, cn } from '../../shared/components/ui'
import { StatusBadge } from '../../shared/components/StatusBadge'
import { useToast } from '../../shared/components/Toast'
import { constructionTypeLabel, documentStatusLabel, documentTone } from '../../shared/app/labels'
import { NORMS, STANDARD_TEI, UNITS } from './norms'

const SECTIONS: { key: SectionKey; title: string }[] = [
  { key: 'object', title: 'Титульные данные и сведения об объекте' },
  { key: 'tei', title: 'Технико-экономические показатели' },
  { key: 'composition', title: 'Состав проектной документации' },
  { key: 'references', title: 'Нормативные ссылки' },
  { key: 'additional', title: 'Дополнительные сведения' },
]
type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict'
const uid = () => Math.random().toString(36).slice(2, 10)
const REQUIRED = ['name', 'address', 'cadastralNumber', 'constructionType', 'developer'] as const
const CADASTRAL = /^\d{2}:\d{2}:\d{6,7}:\d{1,6}$/

export default function DocumentEditorPage({ id }: { id: string }) {
  const nav = useNavigate()
  const toast = useToast()
  const [doc, setDoc] = useState<DocumentDetail | null>(null)
  const [data, setData] = useState<DocumentData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [section, setSection] = useState<SectionKey>('object')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [versionOpen, setVersionOpen] = useState(false)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [params, setParams] = useSearchParams()
  const jump = params.get('field')

  const dataRef = useRef<DocumentData | null>(null)
  const revRef = useRef(1)
  const savingRef = useRef(false)
  const pendingRef = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const stateRef = useRef<SaveState>('saved')
  stateRef.current = saveState

  const load = useCallback(async () => {
    try {
      const [d, v] = await Promise.all([api.documents.get(id), api.documents.validation(id).catch(() => null)])
      setValidation(v)
      setDoc(d)
      setData(d.data)
      dataRef.current = d.data
      revRef.current = d.revision
      setSaveState('saved')
      setSaveError(null)
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'Не удалось загрузить документ')
    }
  }, [id])
  useEffect(() => { load() }, [load])

  const save = useCallback(async () => {
    if (savingRef.current) { pendingRef.current = true; return }
    savingRef.current = true
    setSaveState('saving')
    try {
      do {
        pendingRef.current = false
        const r = await api.documents.saveData(id, dataRef.current!, revRef.current)
        revRef.current = r.revision
        setDoc((d) => (d ? { ...d, ...r, data: d.data } : r))
      } while (pendingRef.current)
      setSaveState('saved')
      setSavedAt(new Date())
      setSaveError(null)
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'conflict' || e.code === 'archived')) setSaveState('conflict')
      else setSaveState('error')
      setSaveError(e instanceof ApiError ? e.message : 'Не удалось сохранить')
    } finally {
      savingRef.current = false
    }
  }, [id])

  const update = (fn: (d: DocumentData) => DocumentData) => {
    if (!dataRef.current || stateRef.current === 'conflict') return
    const next = fn(dataRef.current)
    dataRef.current = next
    setData(next)
    setValidation((v) => (v ? { ...v, stale: true } : v))
    setSaveState('dirty')
    clearTimeout(timer.current)
    timer.current = setTimeout(save, 1200)
  }

  // flush on leaving the page; warn when closing the tab with unsaved changes
  useEffect(() => () => { clearTimeout(timer.current); if (stateRef.current === 'dirty') save() }, [save])
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (stateRef.current !== 'saved') e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])

  const saveVersion = async () => {
    setBusy(true)
    try {
      clearTimeout(timer.current)
      if (stateRef.current === 'dirty' || stateRef.current === 'error') await save()
      const v = await api.documents.saveVersion(id, comment)
      setDoc((d) => (d ? { ...d, currentVersion: v.number } : d))
      toast({ tone: 'success', title: `Версия ${v.number} сохранена` })
      setVersionOpen(false)
      setComment('')
    } catch (e) {
      toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Не удалось сохранить версию' })
    } finally { setBusy(false) }
  }

  const archive = async () => {
    setBusy(true)
    try {
      clearTimeout(timer.current)
      if (stateRef.current === 'dirty' || stateRef.current === 'error') await save()
      await api.documents.archive(id)
      toast({ tone: 'success', title: 'Документ перемещён в архив' })
      nav('/app/documents')
    } catch (e) {
      toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Не удалось архивировать' })
      setBusy(false)
    }
  }
  const unarchive = async () => {
    setBusy(true)
    try {
      await api.documents.restoreFromArchive(id)
      toast({ tone: 'success', title: 'Документ восстановлен из архива' })
      await load()
    } catch (e) {
      toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Не удалось восстановить' })
    } finally { setBusy(false) }
  }

  const runCheck = async () => {
    setChecking(true)
    try {
      clearTimeout(timer.current)
      if (stateRef.current === 'dirty' || stateRef.current === 'error') await save()
      if (stateRef.current === 'conflict' || stateRef.current === 'error') return
      setValidation(await api.documents.validate(id))
      nav(`/app/documents/${id}/validation`)
    } catch (e) {
      toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Проверка не выполнена' })
    } finally { setChecking(false) }
  }

  // "go to field" links from the validation page: open the section, focus and flash the input
  useEffect(() => {
    if (!jump || !doc) return
    const sec = jump.split(/[.[]/)[0] as SectionKey
    if (SECTIONS.some((x) => x.key === sec)) setSection(sec)
    const t = setTimeout(() => {
      let target = jump
      let el: HTMLElement | null = null
      while (target && !el) {
        el = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(target)}"]`)
        if (!el) target = target.includes('.') ? target.slice(0, target.lastIndexOf('.')) : target.includes('[') ? target.slice(0, target.indexOf('[')) : ''
      }
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        el.focus?.({ preventScroll: true })
        const cls = ['outline', 'outline-2', 'outline-primary', '-outline-offset-1']
        el.classList.add(...cls)
        setTimeout(() => el!.classList.remove(...cls), 2500)
      }
      setParams({}, { replace: true })
    }, 80)
    return () => clearTimeout(t)
  }, [jump, doc, setParams])

  const issueCount = (sec: SectionKey, sev: 'error' | 'warning') => validation?.issues.filter((i) => i.section === sec && i.severity === sev).length ?? 0
  const readOnly = doc?.status === 'archived' || saveState === 'conflict'
  const sections = doc?.sections
  if (loadError) return <Alert tone="error" title="Документ недоступен">{loadError} <button className="underline" onClick={() => nav('/app/documents')}>К списку</button></Alert>
  if (!doc || !data) return <p className="text-sm text-muted">Загрузка…</p>

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{doc.title}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{doc.projectName}</span>
            <span aria-hidden>·</span>
            <span className="font-mono">схема {doc.schemaVersion}</span>
            <StatusBadge tone={documentTone[doc.status]}>{documentStatusLabel[doc.status]}</StatusBadge>
            <SaveIndicator state={saveState} at={savedAt} />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => nav(`/app/documents/${id}/versions`)}><History className="size-4" aria-hidden />Версии ({doc.currentVersion})</Button>
          <Button variant="secondary" disabled={readOnly} onClick={() => setVersionOpen((v) => !v)}>Сохранить версию</Button>
          <Button variant="secondary" disabled={readOnly} loading={checking} onClick={runCheck}>Проверить</Button>
          <Button variant="secondary" onClick={() => nav(`/app/documents/${id}/preview`)}>Просмотр XML</Button>
          <Button variant="secondary" onClick={() => nav(`/app/documents/${id}/export`)}>Выгрузка</Button>
          {doc.status === 'archived'
            ? <Button variant="secondary" loading={busy} onClick={unarchive}>Восстановить из архива</Button>
            : <Button variant="secondary" loading={busy} onClick={archive}><Archive className="size-4" aria-hidden />В архив</Button>}
        </div>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded bg-surface-2" role="progressbar" aria-valuenow={doc.progress} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-primary transition-[width]" style={{ width: `${doc.progress}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">Заполнено {Object.values(sections!).filter(Boolean).length} из 5 разделов · {doc.progress}%</p>

      {validation?.stale && <p className="mt-1 text-xs text-warning">Результаты проверки устарели — запустите проверку заново.</p>}
      {versionOpen && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-3">
          <div className="min-w-[260px] flex-1">
            <FormField label="Комментарий к версии">{(p) => <Input {...p} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} placeholder="Что изменилось" />}</FormField>
          </div>
          <Button loading={busy} onClick={saveVersion}>Сохранить</Button>
          <Button variant="secondary" onClick={() => setVersionOpen(false)}>Отмена</Button>
        </div>
      )}
      {doc.status === 'archived' && (
        <div className="mt-3"><Alert tone="warning" title="Документ в архиве">Редактирование недоступно. Восстановите документ из архива, чтобы продолжить работу.</Alert></div>
      )}
      {saveState === 'conflict' && doc.status !== 'archived' && (
        <div className="mt-3"><Alert tone="error" title="Документ изменён в другом окне">
          {saveError} <button className="underline" onClick={load}>Загрузить актуальную версию</button></Alert></div>
      )}
      {saveState === 'error' && (
        <div className="mt-3"><Alert tone="error" title="Изменения не сохранены">{saveError} <button className="underline" onClick={save}>Повторить</button></Alert></div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[270px_1fr]">
        <nav aria-label="Разделы документа" className="space-y-1">
          {SECTIONS.map((s, i) => (
            <button key={s.key} onClick={() => setSection(s.key)} aria-current={section === s.key ? 'step' : undefined}
              className={cn('flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm',
                section === s.key ? 'border-primary bg-primary-soft font-medium' : 'border-transparent hover:bg-surface-2')}>
              <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border text-xs', sections![s.key] ? 'border-success bg-success-soft text-success' : 'border-border-strong')}>
                {sections![s.key] ? <Check className="size-3.5" aria-label="заполнено" /> : i + 1}
              </span>
              <span className="flex-1">{s.title}</span>
              {issueCount(s.key, 'error') > 0 ? <span className={cn('rounded-full bg-danger-soft px-2 py-0.5 text-xs text-danger', validation?.stale && 'opacity-60')} aria-label={`ошибок: ${issueCount(s.key, 'error')}`}>{issueCount(s.key, 'error')}</span>
                : issueCount(s.key, 'warning') > 0 ? <span className={cn('rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning', validation?.stale && 'opacity-60')} aria-label={`предупреждений: ${issueCount(s.key, 'warning')}`}>{issueCount(s.key, 'warning')}</span> : null}
            </button>
          ))}
        </nav>

        <fieldset disabled={readOnly} className="min-w-0 rounded-lg border border-border bg-surface p-5">
          <legend className="sr-only">{SECTIONS.find((s) => s.key === section)!.title}</legend>
          <h3 className="mb-4 text-base font-semibold">{SECTIONS.find((s) => s.key === section)!.title}</h3>
          {section === 'object' && <ObjectSection data={data} update={update} />}
          {section === 'tei' && <TeiSection data={data} update={update} />}
          {section === 'composition' && <CompositionSection data={data} update={update} />}
          {section === 'references' && <ReferencesSection data={data} update={update} />}
          {section === 'additional' && (
            <FormField label="Примечания" hint="Свободный текст, до 20 000 символов">
              {(p) => (
                <textarea {...p} data-field="additional.notes" rows={10} maxLength={20000} value={data.additional.notes}
                  onChange={(e) => update((d) => ({ ...d, additional: { notes: e.target.value } }))}
                  className="w-full rounded-md border border-border-strong bg-surface p-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25" />
              )}
            </FormField>
          )}
        </fieldset>
      </div>
    </div>
  )
}

function SaveIndicator({ state, at }: { state: SaveState; at: Date | null }) {
  const time = at?.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  if (state === 'saving') return <span className="inline-flex items-center gap-1" role="status"><Loader2 className="size-3.5 animate-spin" />Сохранение…</span>
  if (state === 'dirty') return <span role="status">Есть несохранённые изменения</span>
  if (state === 'error' || state === 'conflict') return <span role="status" className="inline-flex items-center gap-1 text-danger"><CircleAlert className="size-3.5" />Не сохранено</span>
  return <span role="status" className="inline-flex items-center gap-1 text-success"><Check className="size-3.5" />{time ? `Сохранено ${time}` : 'Сохранено'}</span>
}

type SectionProps = { data: DocumentData; update: (fn: (d: DocumentData) => DocumentData) => void }

function ObjectSection({ data, update }: SectionProps) {
  const o = data.object
  const set = (k: keyof typeof o) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    update((d) => ({ ...d, object: { ...d.object, [k]: e.target.value } }))
  const err = (k: (typeof REQUIRED)[number]) =>
    !String(o[k]).trim() ? 'Обязательное поле' : k === 'cadastralNumber' && !CADASTRAL.test(o[k]) ? 'Формат: 77:01:0004012:1234' : undefined
  const text = (k: keyof typeof o, label: string, wide = false) => {
    const e = (REQUIRED as readonly string[]).includes(k) ? err(k as (typeof REQUIRED)[number]) : undefined
    return (
      <div className={wide ? 'sm:col-span-2' : ''}>
        <FormField label={label} required={(REQUIRED as readonly string[]).includes(k)} error={e}>
          {(p) => <Input {...p} data-field={`object.${k}`} invalid={p.invalid} value={o[k]} onChange={set(k)} className={k === 'cadastralNumber' ? 'font-mono' : ''} />}
        </FormField>
      </div>
    )
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {text('name', 'Наименование объекта', true)}
      {text('address', 'Адрес', true)}
      {text('cadastralNumber', 'Кадастровый номер')}
      <FormField label="Вид строительства" required error={err('constructionType')}>
        {(p) => (
          <Select {...p} data-field="object.constructionType" invalid={p.invalid} value={o.constructionType} onChange={set('constructionType')}>
            <option value="">Не выбрано</option>
            {Object.entries(constructionTypeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        )}
      </FormField>
      {text('developer', 'Застройщик')}
      {text('customer', 'Технический заказчик')}
      {text('designer', 'Проектировщик')}
      {text('functionalPurpose', 'Функциональное назначение')}
      {text('financingSource', 'Источник финансирования')}
    </div>
  )
}

function TeiSection({ data, update }: SectionProps) {
  const rows = data.tei
  const patch = (id: string, p: Partial<TeiRow>) => update((d) => ({ ...d, tei: d.tei.map((r) => (r.id === id ? { ...r, ...p } : r)) }))
  const addRows = (list: [string, string][]) => update((d) => ({ ...d, tei: [...d.tei, ...list.map(([name, unit]) => ({ id: uid(), name, unit, value: '' }))] }))
  const area = rows.filter((r) => r.unit === 'м²').reduce((s, r) => s + (parseFloat(r.value.replace(/\s/g, '').replace(',', '.')) || 0), 0)
  return (
    <div data-field="tei">
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong px-6 py-8 text-center text-sm">
          <p className="font-medium">Показателей пока нет</p>
          <p className="mt-1 text-muted">Добавьте типовой набор или создайте строки вручную.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="text-left text-xs text-muted"><tr><th className="pb-2 font-medium">Показатель</th><th className="pb-2 font-medium">Ед.</th><th className="pb-2 font-medium">Значение</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-field={`tei[${r.id}]`} className="border-t border-border align-top">
                  <td className="py-2 pr-2"><Input aria-label="Показатель" data-field={`tei[${r.id}].name`} invalid={!r.name.trim()} value={r.name} onChange={(e) => patch(r.id, { name: e.target.value })} /></td>
                  <td className="w-32 py-2 pr-2">
                    <Select aria-label="Единица измерения" data-field={`tei[${r.id}].unit`} invalid={!r.unit} value={r.unit} onChange={(e) => patch(r.id, { unit: e.target.value })}>
                      <option value="">—</option>{UNITS.map((u) => <option key={u}>{u}</option>)}
                    </Select>
                  </td>
                  <td className="w-40 py-2 pr-2"><Input aria-label="Значение" data-field={`tei[${r.id}].value`} inputMode="decimal" invalid={!r.value.trim()} className="text-right font-mono" value={r.value} onChange={(e) => patch(r.id, { value: e.target.value })} /></td>
                  <td className="w-10 py-2"><Button variant="ghost" size="sm" aria-label="Удалить строку" onClick={() => update((d) => ({ ...d, tei: d.tei.filter((x) => x.id !== r.id) }))}><Trash2 className="size-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => addRows([['', '']])}><Plus className="size-4" aria-hidden />Добавить показатель</Button>
        <Button variant="secondary" size="sm" onClick={() => addRows(STANDARD_TEI as [string, string][])}>Добавить типовые</Button>
        {rows.length > 0 && <span className="ml-auto text-sm text-muted">Строк: {rows.length} · сумма по м²: <span className="font-mono text-fg">{area.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}</span></span>}
      </div>
    </div>
  )
}

function CompositionSection({ data, update }: SectionProps) {
  const set = (code: string, p: Partial<CompositionItem>) => update((d) => ({ ...d, composition: d.composition.map((c) => (c.code === code ? { ...c, ...p } : c)) }))
  return (
    <ul data-field="composition" className="divide-y divide-border">
      {data.composition.map((c) => (
        <li key={c.code} data-field={`composition[${c.code}]`} className="py-3">
          <Checkbox label={<span><span className="font-mono text-muted">Раздел {c.code}.</span> {c.title}</span>} checked={c.included} onChange={(e) => set(c.code, { included: e.target.checked })} />
          {c.included && (
            <div className="ml-7 mt-2"><Input aria-label={`Примечание к разделу ${c.code}`} placeholder="Примечание (необязательно)" value={c.note} onChange={(e) => set(c.code, { note: e.target.value })} /></div>
          )}
        </li>
      ))}
    </ul>
  )
}

function ReferencesSection({ data, update }: SectionProps) {
  const [q, setQ] = useState('')
  const [code, setCode] = useState('')
  const [title, setTitle] = useState('')
  const chosen = new Set(data.references.map((r) => r.code))
  const found = useMemo(() => NORMS.filter((n) => !chosen.has(n.code) && `${n.code} ${n.title}`.toLowerCase().includes(q.trim().toLowerCase())), [q, data.references]) // eslint-disable-line react-hooks/exhaustive-deps
  const add = (r: Omit<NormRef, 'id'>) => update((d) => ({ ...d, references: [...d.references, { id: uid(), ...r }] }))
  return (
    <div data-field="references" className="space-y-6">
      <div>
        <h4 className="mb-2 text-sm font-medium">В документе ({data.references.length})</h4>
        {data.references.length === 0 ? <p className="text-sm text-muted">Ссылок пока нет.</p> : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {data.references.map((r) => (
              <li key={r.id} data-field={`references[${r.id}]`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span><span className="font-medium">{r.code}</span>{r.title && <span className="text-muted"> — {r.title}</span>}{r.custom && <span className="ml-2 text-xs text-subtle">своя</span>}</span>
                <Button variant="ghost" size="sm" aria-label={`Удалить ${r.code}`} onClick={() => update((d) => ({ ...d, references: d.references.filter((x) => x.id !== r.id) }))}><Trash2 className="size-4" /></Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4 className="mb-2 text-sm font-medium">Каталог</h4>
        <Input aria-label="Поиск по каталогу" placeholder="Поиск: СП, ГОСТ, закон…" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="mt-2 divide-y divide-border rounded-md border border-border">
          {found.length === 0 && <li className="px-3 py-3 text-sm text-muted">Ничего не найдено</li>}
          {found.map((n) => (
            <li key={n.code} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span><span className="font-medium">{n.code}</span><span className="text-muted"> — {n.title}</span></span>
              <Button size="sm" variant="secondary" onClick={() => add({ ...n, custom: false })}>Добавить</Button>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-medium">Своя ссылка</h4>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-52"><FormField label="Обозначение">{(p) => <Input {...p} value={code} onChange={(e) => setCode(e.target.value)} maxLength={100} />}</FormField></div>
          <div className="min-w-[220px] flex-1"><FormField label="Наименование">{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} />}</FormField></div>
          <Button variant="secondary" disabled={!code.trim()} onClick={() => { add({ code: code.trim(), title: title.trim(), custom: true }); setCode(''); setTitle('') }}>Добавить</Button>
        </div>
      </div>
    </div>
  )
}
