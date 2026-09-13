'use client';

import { useEffect, useState, type DragEvent, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { Button, Card } from '@/components/ui';
import { cn } from '@/lib/core';

export type WidgetSpan = 3 | 4 | 6 | 8 | 12;
export type WidgetHeight = 'auto' | 'sm' | 'md' | 'lg';

export interface WidgetDef {
  key: string;
  label: string;
  node: ReactNode;
  /** false = tidak bisa disembunyikan (mis. widget inti) */
  canHide?: boolean;
  /** lebar default pada layar besar (1–12 kolom) */
  defaultSpan?: WidgetSpan;
  defaultHeight?: WidgetHeight;
}

interface LayoutItem {
  key: string;
  hidden?: boolean;
  span?: WidgetSpan;
  height?: WidgetHeight;
}

const SPAN_CLS: Record<WidgetSpan, string> = {
  3: 'lg:col-span-3',
  4: 'lg:col-span-4',
  6: 'lg:col-span-6',
  8: 'lg:col-span-8',
  12: 'lg:col-span-12',
};
const SPAN_LABEL: Record<WidgetSpan, string> = { 3: '¼', 4: '⅓', 6: '½', 8: '⅔', 12: 'Penuh' };
const SPANS: WidgetSpan[] = [3, 4, 6, 8, 12];

const HEIGHT_CLS: Record<WidgetHeight, string> = {
  auto: '',
  sm: 'lg:max-h-[300px]',
  md: 'lg:max-h-[440px]',
  lg: 'lg:max-h-[640px]',
};
const HEIGHT_LABEL: Record<WidgetHeight, string> = { auto: 'Auto', sm: 'S', md: 'M', lg: 'L' };
const HEIGHTS: WidgetHeight[] = ['auto', 'sm', 'md', 'lg'];

/**
 * Susunan widget per halaman **per user**:
 * - Atur Widget → drag & drop urutan, sembunyikan, **atur ukuran** (lebar & tinggi)
 * - Tersimpan otomatis ke backend (/me/layout/<pageKey>)
 */
export function WidgetBoard({
  pageKey,
  widgets,
  className,
}: {
  pageKey: string;
  widgets: WidgetDef[];
  className?: string;
}) {
  const defaults = () =>
    Object.fromEntries(
      widgets.map((w) => [
        w.key,
        { span: (w.defaultSpan ?? 12) as WidgetSpan, height: (w.defaultHeight ?? 'auto') as WidgetHeight },
      ]),
    ) as Record<string, { span: WidgetSpan; height: WidgetHeight }>;

  const [order, setOrder] = useState<string[]>(widgets.map((w) => w.key));
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [sizes, setSizes] = useState<Record<string, { span: WidgetSpan; height: WidgetHeight }>>(defaults);
  const [arrange, setArrange] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<{ layout: LayoutItem[] | null }>(`/me/layout/${pageKey}`)
      .then((r) => {
        if (r.layout && r.layout.length > 0) {
          const keys = r.layout.map((x) => x.key).filter((k) => widgets.some((w) => w.key === k));
          const missing = widgets.map((w) => w.key).filter((k) => !keys.includes(k));
          setOrder([...keys, ...missing]);
          setHidden(Object.fromEntries(r.layout.map((x) => [x.key, !!x.hidden])));
          const base = defaults();
          const merged: Record<string, { span: WidgetSpan; height: WidgetHeight }> = { ...base };
          for (const item of r.layout) {
            if (merged[item.key] && (item.span || item.height)) {
              merged[item.key] = {
                span: (item.span ?? merged[item.key].span) as WidgetSpan,
                height: (item.height ?? merged[item.key].height) as WidgetHeight,
              };
            }
          }
          setSizes(merged);
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]);

  function persist(nextOrder: string[], nextHidden: Record<string, boolean>, nextSizes = sizes) {
    setSaved(false);
    api(`/me/layout/${pageKey}`, {
      method: 'PUT',
      body: {
        layout: nextOrder.map((k) => ({
          key: k,
          hidden: !!nextHidden[k],
          span: nextSizes[k]?.span ?? 12,
          height: nextSizes[k]?.height ?? 'auto',
        })),
      },
    })
      .then(() => setSaved(true))
      .catch(() => undefined);
  }

  function moveTo(targetKey: string) {
    if (!dragKey || dragKey === targetKey) return;
    const next = [...order];
    const from = next.indexOf(dragKey);
    const to = next.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    next.splice(from, 1);
    next.splice(to, 0, dragKey);
    setOrder(next);
    setDragKey(null);
    setOverKey(null);
    persist(next, hidden);
  }

  function toggleHidden(key: string) {
    const next = { ...hidden, [key]: !hidden[key] };
    setHidden(next);
    persist(order, next);
  }

  function setSpan(key: string, span: WidgetSpan) {
    const next = { ...sizes, [key]: { ...(sizes[key] ?? { span: 12, height: 'auto' }), span } };
    setSizes(next);
    persist(order, hidden, next);
  }

  function setHeight(key: string, height: WidgetHeight) {
    const next = { ...sizes, [key]: { ...(sizes[key] ?? { span: 12, height: 'auto' }), height } };
    setSizes(next);
    persist(order, hidden, next);
  }

  function reset() {
    const next = widgets.map((w) => w.key);
    setOrder(next);
    setHidden({});
    setSizes(defaults());
    persist(next, {}, defaults());
  }

  const byKey = new Map(widgets.map((w) => [w.key, w]));
  const visible = order.filter((k) => !hidden[k] && byKey.has(k));
  const hiddenList = order.filter((k) => hidden[k] && byKey.has(k));

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-400">
          {arrange
            ? 'Mode atur: seret ⠿ untuk memindah, atur lebar (¼ ⅓ ½ ⅔ Penuh) & tinggi (S/M/L), 👁 sembunyikan.'
            : 'Susunan & ukuran widget dapat diatur sesuai keinginan Anda (per akun).'}
        </p>
        <div className="flex items-center gap-2">
          {saved ? <span className="text-[11px] text-emerald-600">tersimpan ✓</span> : null}
          {arrange ? (
            <>
              <Button size="sm" variant="ghost" onClick={reset}>
                Reset
              </Button>
              <Button size="sm" onClick={() => setArrange(false)}>
                Selesai
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setArrange(true)}>
              ⠿ Atur Widget
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {visible.map((k) => {
          const w = byKey.get(k)!;
          const size = sizes[k] ?? { span: 12 as WidgetSpan, height: 'auto' as WidgetHeight };
          if (!arrange) {
            return (
              <div key={k} className={cn('col-span-12 min-w-0', SPAN_CLS[size.span], HEIGHT_CLS[size.height], size.height !== 'auto' && 'overflow-auto')}>
                {w.node}
              </div>
            );
          }
          return (
            <div
              key={k}
              onDragOver={(e: DragEvent) => {
                e.preventDefault();
                setOverKey(k);
              }}
              onDrop={(e: DragEvent) => {
                e.preventDefault();
                moveTo(k);
              }}
              className={cn(
                'col-span-12 min-w-0 rounded-[22px] border-2 border-dashed p-1 transition',
                SPAN_CLS[size.span],
                overKey === k && dragKey && dragKey !== k ? 'border-[#E53935] bg-[#FDECEA]/40' : 'border-slate-200',
              )}
            >
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span
                  draggable
                  onDragStart={() => setDragKey(k)}
                  onDragEnd={() => {
                    setDragKey(null);
                    setOverKey(null);
                  }}
                  className="cursor-grab rounded-full bg-slate-100 px-2 py-0.5 text-sm text-slate-500 active:cursor-grabbing"
                  title="Seret untuk memindahkan"
                >
                  ⠿
                </span>
                <span className="text-[12px] font-semibold text-slate-600">{w.label}</span>

                <span className="ml-auto flex items-center gap-1">
                  <span className="mr-1 hidden text-[10px] text-slate-400 lg:inline">Lebar:</span>
                  {SPANS.map((sp) => (
                    <button
                      key={sp}
                      onClick={() => setSpan(k, sp)}
                      title={`Lebar ${SPAN_LABEL[sp]}`}
                      className={cn(
                        'hidden rounded-full px-2 py-0.5 text-[11px] font-semibold transition lg:inline-block',
                        size.span === sp ? 'bg-[#E53935] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                      )}
                    >
                      {SPAN_LABEL[sp]}
                    </button>
                  ))}
                  <span className="mr-1 ml-2 hidden text-[10px] text-slate-400 lg:inline">Tinggi:</span>
                  {HEIGHTS.map((h) => (
                    <button
                      key={h}
                      onClick={() => setHeight(k, h)}
                      title={`Tinggi ${HEIGHT_LABEL[h]}`}
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-semibold transition',
                        size.height === h ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                      )}
                    >
                      {HEIGHT_LABEL[h]}
                    </button>
                  ))}
                  {w.canHide === false ? null : (
                    <button
                      onClick={() => toggleHidden(k)}
                      title={hidden[k] ? 'Tampilkan' : 'Sembunyikan'}
                      className="ml-1 rounded-full px-2 py-0.5 text-xs text-slate-500 transition hover:bg-slate-100"
                    >
                      👁
                    </button>
                  )}
                </span>
              </div>
              <div className={cn('pointer-events-none opacity-90', HEIGHT_CLS[size.height])}>{w.node}</div>
            </div>
          );
        })}
      </div>

      {arrange && hiddenList.length > 0 ? (
        <Card className="p-3">
          <p className="mb-2 text-[11px] font-bold tracking-wide text-slate-500 uppercase">Widget disembunyikan</p>
          <div className="flex flex-wrap gap-2">
            {hiddenList.map((k) => (
              <button
                key={k}
                onClick={() => toggleHidden(k)}
                className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-medium text-slate-600 transition hover:bg-slate-200"
              >
                + Tampilkan {byKey.get(k)!.label}
              </button>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
