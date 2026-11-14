import React, { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Download, UploadCloud } from 'lucide-react'

import { api, ApiError } from '../../shared/api'
import type { SchemaInfo, StructureNode } from '../../shared/types'
import { Alert, Button, Checkbox, FormField, Input, cn } from '../../shared/components/ui'
import { StatusBadge } from '../../shared/components/StatusBadge'
import { useToast } from '../../shared/components/Toast'
import { fmtDate } from '../../shared/app/labels'

const VERSION_RE = /^\d{1,3}(\.\d{1,3}){1,2}$/
const MAX_BYTES = 2 * 1024 * 1024
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} КБ`

export default function SchemasAdminPage() {
  const toast = useToast()
  const [items, setItems] = useState<SchemaInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [tree, setTree] = useState<StructureNode[] | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api.schemas.list(true).then((r) => { setItems(r); window.dispatchEvent(new Event('pz:schemas-changed')) }).catch((e) => setError(e.message ?? 'Не удалось загрузить схемы'))
  }, [])
  useEffect(load, [load])

  useEffect(() => {
    setTree(null)
    if (selected) api.schemas.structure(selected).then(setTree).catch(() => setTree([]))
  }, [selected])

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true)
    try {
      await fn()
      if (ok) toast({ tone: 'success', title: ok })
      load()
    } catch (e) {
      toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Операция не выполнена' })
    } finally { setBusy(false) }
  }

  if (error) return <Alert tone="error" title="Ошибка загрузки">{error} <button className="underline" onClick={() => { setError(null); load() }}>Повторить</button></Alert>
  const current = items?.find((s) => s.id === selected)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Версии XSD, по которым создаются и проверяются документы</p>
        <Button onClick={() => setUploadOpen((v) => !v)}><UploadCloud className="size-4" aria-hidden />Загрузить XSD</Button>
      </div>

      {uploadOpen && <UploadForm onDone={() => { setUploadOpen(false); load() }} onCancel={() => setUploadOpen(false)} />}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>{['Версия', 'Название', 'Статус', 'Документов', 'Размер', 'Загружена', 'Действия'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {!items && <tr><td colSpan={7} className="px-4 py-6"><div className="h-4 animate-pulse rounded bg-surface-2" /></td></tr>}
            {items?.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center"><p className="font-medium">Схем пока нет</p><p className="mt-1 text-sm text-muted">Загрузите XSD или выполните <code className="font-mono">python -m app.seed</code>.</p></td></tr>
            )}
            {items?.map((s) => (
              <tr key={s.id} className={cn('border-t border-border', selected === s.id && 'bg-primary-soft')}>
                <td className="px-4 py-3 font-mono">{s.version}</td>
                <td className="px-4 py-3"><div className="font-medium">{s.title}</div><div className="font-mono text-xs text-muted">{s.filename}</div></td>
                <td className="px-4 py-3"><span className="flex flex-wrap gap-1">
                  <StatusBadge tone={s.isActive ? 'success' : 'neutral'}>{s.isActive ? 'Активна' : 'Отключена'}</StatusBadge>
                  {s.isDefault && <StatusBadge tone="primary">По умолчанию</StatusBadge>}
                </span></td>
                <td className="px-4 py-3">{s.documentsCount}</td>
                <td className="px-4 py-3 text-muted">{kb(s.sizeBytes)}</td>
                <td className="px-4 py-3 text-muted">{fmtDate(s.createdAt)}<div className="text-xs">{s.uploadedByName}</div></td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-primary">
                    <button className="hover:underline" onClick={() => setSelected(selected === s.id ? null : s.id)}>{selected === s.id ? 'Скрыть' : 'Структура'}</button>
                    <button className="hover:underline" disabled={busy} onClick={() => run(() => api.schemas.download(s.id, s.filename || `schema_${s.version}.xsd`))}><Download className="inline size-3.5" aria-label="Скачать" /> XSD</button>
                    {!s.isDefault && s.isActive && <button className="hover:underline" disabled={busy} onClick={() => run(() => api.schemas.makeDefault(s.id), `Схема ${s.version} назначена по умолчанию`)}>Сделать основной</button>}
                    {!s.isDefault && <button className="hover:underline" disabled={busy} onClick={() => run(() => api.schemas.update(s.id, { isActive: !s.isActive }), s.isActive ? 'Схема отключена' : 'Схема активирована')}>{s.isActive ? 'Отключить' : 'Активировать'}</button>}
                    {!s.isDefault && s.documentsCount === 0 && (
                      confirmDelete === s.id
                        ? <span className="text-danger">Удалить? <button className="font-medium underline" onClick={() => { setConfirmDelete(null); if (selected === s.id) setSelected(null); run(() => api.schemas.remove(s.id), 'Схема удалена') }}>Да</button> / <button className="underline" onClick={() => setConfirmDelete(null)}>Нет</button></span>
                        : <button className="text-danger hover:underline" onClick={() => setConfirmDelete(s.id)}>Удалить</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {current && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-lg border border-border bg-surface p-4 text-sm">
            <h3 className="font-semibold">Схема {current.version}</h3>
            <dl className="mt-3 space-y-3">
              <div><dt className="text-xs text-muted">История изменений</dt><dd className="whitespace-pre-line">{current.changelog || '—'}</dd></div>
              <div><dt className="text-xs text-muted">Совместимость</dt><dd className="whitespace-pre-line">{current.compatibility || '—'}</dd></div>
              <div><dt className="text-xs text-muted">SHA-256</dt><dd className="break-all font-mono text-xs">{current.checksum}</dd></div>
            </dl>
          </section>
          <section className="rounded-lg border border-border bg-surface p-4 text-sm">
            <h3 className="mb-2 font-semibold">Структура</h3>
            {tree === null ? <p className="text-muted">Загрузка…</p> : tree.length === 0 ? <p className="text-muted">Нет данных</p> : <ul role="tree">{tree.map((n) => <TreeNode key={n.name} node={n} depth={0} />)}</ul>}
          </section>
        </div>
      )}
    </div>
  )
}

function TreeNode({ node, depth }: { node: StructureNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1)
  const has = node.children.length > 0
  return (
    <li role="treeitem" aria-expanded={has ? open : undefined}>
      <div className={cn('flex items-center gap-1.5 py-0.5', has && 'cursor-pointer rounded hover:bg-surface-2')} style={{ paddingLeft: depth * 16 }} onClick={() => has && setOpen(!open)}>
        {has ? (
          <button type="button" aria-label={open ? 'Свернуть' : 'Развернуть'} className="text-muted"><ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} /></button>
        ) : <span className="inline-block w-4" />}
        <span className={cn('font-mono', node.kind === 'attribute' && 'text-muted')}>{node.name}</span>
        {node.type && <span className="text-xs text-subtle">{node.type}</span>}
        {node.required && <span className="rounded bg-danger-soft px-1.5 text-[11px] text-danger">обяз.</span>}
        {node.repeatable && <span className="rounded bg-primary-soft px-1.5 text-[11px] text-primary">повтор.</span>}
      </div>
      {has && open && <ul role="group">{node.children.map((c) => <TreeNode key={c.name} node={c} depth={depth + 1} />)}</ul>}
    </li>
  )
}

function UploadForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const toast = useToast()
  const [file, setFile] = useState<{ name: string; content: string } | null>(null)
  const [version, setVersion] = useState('')
  const [title, setTitle] = useState('')
  const [changelog, setChangelog] = useState('')
  const [compat, setCompat] = useState('')
  const [makeDefault, setMakeDefault] = useState(false)
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)

  const pick = async (f?: File) => {
    if (!f) return
    setError(null)
    if (!f.name.toLowerCase().endsWith('.xsd')) return setError('Нужен файл с расширением .xsd')
    if (f.size > MAX_BYTES) return setError('Файл больше 2 МБ')
    setFile({ name: f.name, content: await f.text() })
    const m = f.name.match(/(\d{1,3}\.\d{1,3}(?:\.\d{1,3})?)/)
    if (m && !version) setVersion(m[1])
  }

  const versionErr = touched && !VERSION_RE.test(version) ? 'Формат: 01.06 или 1.2.3' : undefined
  const titleErr = touched && title.trim().length < 3 ? 'Укажите название' : undefined

  const submit = async () => {
    setTouched(true)
    if (!file) return setError('Выберите файл XSD')
    if (!VERSION_RE.test(version) || title.trim().length < 3) return
    setBusy(true)
    setError(null)
    try {
      await api.schemas.upload({ version, title: title.trim(), filename: file.name, content: file.content, changelog, compatibility: compat, makeDefault })
      toast({ tone: 'success', title: `Схема ${version} загружена` })
      onDone()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось загрузить схему')
      setBusy(false)
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-border bg-surface p-4">
      {error && <div className="mb-3"><Alert tone="error" title="Схема не принята">{error}</Alert></div>}
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]) }}
        className={cn('flex cursor-pointer flex-col items-center rounded-lg border border-dashed px-6 py-6 text-center text-sm', drag ? 'border-primary bg-primary-soft' : 'border-border-strong bg-surface-2')}>
        <UploadCloud className="mb-1 text-muted" aria-hidden />
        {file ? <span className="font-mono">{file.name} · {kb(file.content.length)}</span> : <span>Перетащите .xsd сюда или нажмите для выбора</span>}
        <span className="text-xs text-muted">До 2 МБ. Схема проверяется при загрузке; xs:include и xs:import не поддерживаются.</span>
        <input type="file" accept=".xsd" className="sr-only" aria-label="Файл XSD" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <FormField label="Версия" required error={versionErr}>{(p) => <Input {...p} invalid={p.invalid} className="font-mono" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="01.06" />}</FormField>
        <FormField label="Название" required error={titleErr}>{(p) => <Input {...p} invalid={p.invalid} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={255} />}</FormField>
        <FormField label="История изменений">{(p) => <textarea {...p} rows={3} value={changelog} onChange={(e) => setChangelog(e.target.value)} className="w-full rounded-md border border-border-strong bg-surface p-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25" />}</FormField>
        <FormField label="Совместимость">{(p) => <textarea {...p} rows={3} value={compat} onChange={(e) => setCompat(e.target.value)} className="w-full rounded-md border border-border-strong bg-surface p-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25" />}</FormField>
      </div>
      <div className="mt-3"><Checkbox label="Сделать схемой по умолчанию" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} /></div>
      <div className="mt-4 flex gap-2"><Button loading={busy} onClick={submit}>Загрузить</Button><Button variant="secondary" onClick={onCancel}>Отмена</Button></div>
    </div>
  )
}
