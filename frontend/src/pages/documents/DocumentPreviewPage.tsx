import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Copy, Search } from 'lucide-react'

import { api, ApiError } from '../../shared/api'
import type { DocumentDetail, XmlPreview } from '../../shared/types'
import { Alert, Button, Input, cn } from '../../shared/components/ui'
import { StatusBadge } from '../../shared/components/StatusBadge'
import { useToast } from '../../shared/components/Toast'
import { constructionTypeLabel } from '../../shared/app/labels'

export default function DocumentPreviewPage({ id }: { id: string }) {
  const nav = useNavigate()
  const toast = useToast()
  const [doc, setDoc] = useState<DocumentDetail | null>(null)
  const [xml, setXml] = useState<XmlPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'tree' | 'raw'>('tree')
  const [q, setQ] = useState('')

  useEffect(() => {
    Promise.all([api.documents.get(id), api.documents.xml(id)])
      .then(([d, x]) => { setDoc(d); setXml(x) })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Не удалось построить XML'))
  }, [id])

  const parsed = useMemo(() => {
    if (!xml) return null
    const d = new DOMParser().parseFromString(xml.xml, 'application/xml')
    return d.querySelector('parsererror') ? null : d.documentElement
  }, [xml])

  const copy = async () => {
    try { await navigator.clipboard.writeText(xml!.xml); toast({ tone: 'success', title: 'XML скопирован' }) }
    catch { toast({ tone: 'error', title: 'Не удалось скопировать' }) }
  }

  if (error) return <Alert tone="error" title="Документ недоступен">{error} <button className="underline" onClick={() => nav('/app/documents')}>К списку</button></Alert>
  if (!doc || !xml) return <p className="text-sm text-muted">Построение XML…</p>

  const needle = q.trim().toLowerCase()
  const lines = xml.xml.trimEnd().split('\n')

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{doc.title}</h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            <span className="font-mono">{xml.filename}</span>
            <StatusBadge tone={xml.xsdValid ? 'success' : 'danger'}>{xml.xsdValid ? 'Соответствует XSD' : 'Не соответствует XSD'}</StatusBadge>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-subtle" aria-hidden />
            <Input aria-label="Поиск по XML" className="w-56 pl-9" placeholder="Поиск по XML" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div role="group" aria-label="Режим" className="flex overflow-hidden rounded-md border border-border-strong text-sm">
            {([['tree', 'Дерево'], ['raw', 'Исходный']] as const).map(([k, l]) => (
              <button key={k} aria-pressed={mode === k} onClick={() => setMode(k)} className={cn('px-3 py-2.5', mode === k ? 'bg-primary-soft font-medium' : 'bg-surface text-muted')}>{l}</button>
            ))}
          </div>
          <Button variant="secondary" onClick={copy}><Copy className="size-4" aria-hidden />Копировать</Button>
          <Button variant="secondary" onClick={() => nav(`/app/documents/${id}/export`)}>Выгрузка</Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-label="XML" className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-surface-2 py-3 font-mono text-[13px] leading-6">
          {mode === 'tree' && parsed && <XmlNode el={parsed} depth={0} needle={needle} />}
          {mode === 'tree' && !parsed && <p className="px-4 text-danger">XML не удалось разобрать</p>}
          {mode === 'raw' && lines.map((l, i) => (
            <div key={i} className={cn('flex whitespace-pre px-3', needle && l.toLowerCase().includes(needle) && 'bg-warning-soft')}>
              <span className="w-8 shrink-0 select-none text-right text-subtle">{i + 1}</span><span className="ml-3">{l}</span>
            </div>
          ))}
        </section>
        <Readable data={doc.data} title={doc.title} />
      </div>
    </div>
  )
}

function XmlNode({ el, depth, needle }: { el: Element; depth: number; needle: string }) {
  // null = follow the default (shallow nodes open; everything open while searching), otherwise the user's choice
  const [toggled, setToggled] = useState<boolean | null>(null)
  const open = toggled ?? (depth < 2 || !!needle)
  const kids = Array.from(el.children)
  const text = kids.length === 0 ? el.textContent ?? '' : ''
  const attrs = Array.from(el.attributes)
  const hit = needle && (el.tagName.toLowerCase().includes(needle) || text.toLowerCase().includes(needle) || attrs.some((a) => a.value.toLowerCase().includes(needle)))
  return (
    <div role="treeitem" aria-expanded={kids.length ? open : undefined}>
      <div className={cn('flex items-baseline gap-1 px-3', kids.length > 0 && 'cursor-pointer hover:bg-surface', hit && 'bg-warning-soft')} style={{ paddingLeft: 12 + depth * 18 }} onClick={() => kids.length > 0 && setToggled(!open)}>
        {kids.length > 0 ? <ChevronRight className={cn('size-3.5 shrink-0 self-center text-subtle transition-transform', open && 'rotate-90')} aria-hidden /> : <span className="inline-block w-3.5 shrink-0" />}
        <span className="text-primary">&lt;{el.tagName}</span>
        {attrs.map((a) => <span key={a.name}><span className="text-muted"> {a.name}</span>=<span className="text-success">"{a.value}"</span></span>)}
        <span className="text-primary">&gt;</span>
        {kids.length === 0 && <><span className="break-all">{text}</span><span className="text-primary">&lt;/{el.tagName}&gt;</span></>}
        {kids.length > 0 && !open && <span className="text-subtle">… {kids.length}</span>}
      </div>
      {kids.length > 0 && open && (
        <>
          {kids.map((k, i) => <XmlNode key={i} el={k} depth={depth + 1} needle={needle} />)}
          <div className="px-3 text-primary" style={{ paddingLeft: 12 + depth * 18 + 18 }}>&lt;/{el.tagName}&gt;</div>
        </>
      )}
    </div>
  )
}

function Readable({ data, title }: { data: DocumentDetail['data']; title: string }) {
  const o = data.object
  const rows: [string, string][] = [
    ['Наименование', o.name], ['Адрес', o.address], ['Кадастровый номер', o.cadastralNumber],
    ['Вид строительства', constructionTypeLabel[o.constructionType as keyof typeof constructionTypeLabel] ?? o.constructionType],
    ['Застройщик', o.developer], ['Технический заказчик', o.customer], ['Проектировщик', o.designer],
    ['Функциональное назначение', o.functionalPurpose], ['Источник финансирования', o.financingSource],
  ]
  return (
    <section aria-label="Документ" className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-surface p-5 text-sm">
      <h3 className="text-base font-semibold">{title}</h3>
      <dl className="mt-3 divide-y divide-border">
        {rows.filter(([, v]) => v).map(([k, v]) => <div key={k} className="grid gap-1 py-2 sm:grid-cols-[170px_1fr]"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <h4 className="mb-2 mt-5 font-semibold">Технико-экономические показатели</h4>
      {data.tei.length === 0 ? <p className="text-muted">Не заполнены</p> : (
        <table className="w-full"><tbody>{data.tei.map((r) => <tr key={r.id} className="border-t border-border"><td className="py-1.5">{r.name}</td><td className="text-muted">{r.unit}</td><td className="text-right font-mono">{r.value}</td></tr>)}</tbody></table>
      )}
      <h4 className="mb-2 mt-5 font-semibold">Состав проектной документации</h4>
      <ol className="list-none space-y-1">{data.composition.filter((c) => c.included).map((c) => <li key={c.code}><span className="font-mono text-muted">{c.code}.</span> {c.title}{c.note && <span className="text-muted"> — {c.note}</span>}</li>)}</ol>
      <h4 className="mb-2 mt-5 font-semibold">Нормативные ссылки</h4>
      {data.references.length === 0 ? <p className="text-muted">Не указаны</p> : <ul className="space-y-1">{data.references.map((r) => <li key={r.id}><b>{r.code}</b>{r.title && <span className="text-muted"> — {r.title}</span>}</li>)}</ul>}
      {data.additional.notes && <><h4 className="mb-2 mt-5 font-semibold">Дополнительные сведения</h4><p className="whitespace-pre-line">{data.additional.notes}</p></>}
    </section>
  )
}
