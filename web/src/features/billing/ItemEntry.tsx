import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Minus, Plus, PlusCircle, Search, X } from 'lucide-react';
import type { Item } from '../../../../shared/types';
import { matchItems } from '../../../../shared/search';
import { formatINR, paiseToRupees, rupeesToPaise } from '../../lib/format';

export interface NewLine {
  itemId: number | null;
  name: string;
  qty: number;
  rateText: string;
}

/**
 * The entry row at the top of the bill: search an item, set qty and rate, Add.
 * It is only a form. Nothing in it is on the bill until Add is tapped, and it clears itself
 * for the next item, so the bill never carries a blank line.
 */
export function ItemEntry({ items, allowCustom, onAdd }: { items: Item[]; allowCustom: boolean; onAdd: (line: NewLine) => void }) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<{ itemId: number | null; name: string } | null>(null);
  const [qty, setQty] = useState(1);
  const [rateText, setRateText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => (picked ? [] : matchItems(query, items, 12)), [query, items, picked]);
  const showCustom =
    allowCustom && !picked && query.trim().length >= 2 && !matches.some((m) => m.name.toLowerCase() === query.trim().toLowerCase());
  const options = matches.length + (showCustom ? 1 : 0);

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const pick = (item: Item | null) => {
    if (item) {
      setPicked({ itemId: item.id, name: item.name });
      setRateText(item.defaultPricePaise !== null ? paiseToRupees(item.defaultPricePaise).replace(/\.00$/, '') : '');
    } else {
      setPicked({ itemId: null, name: query.trim() });
      setRateText('');
    }
    setQty(1);
    setOpen(false);
    setTimeout(() => rateRef.current?.focus(), 0);
  };

  const reset = () => {
    setPicked(null);
    setQuery('');
    setQty(1);
    setRateText('');
    setActive(0);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  const ratePaise = rupeesToPaise(rateText);
  const canAdd = !!picked && qty > 0 && ratePaise !== null;

  const add = () => {
    if (!picked || ratePaise === null) return;
    onAdd({ itemId: picked.itemId, name: picked.name, qty, rateText });
    reset();
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!options) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(options - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(active < matches.length ? matches[active] : null);
    }
  };

  return (
    <div ref={boxRef} className="rounded-2xl border-2 border-brand-100 bg-brand-50/60 p-3">
      <div className="relative">
        {picked ? (
          <div className="flex h-12 items-center gap-2 rounded-xl border border-brand-600 bg-white pl-3 pr-1">
            <span className="flex-1 truncate font-semibold text-brand-900">{picked.name}</span>
            {picked.itemId === null ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Unlisted</span>
            ) : null}
            <button type="button" onClick={reset} className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100" aria-label="Change item">
              <X size={18} />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-500" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
                setActive(0);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={onSearchKey}
              placeholder="Search item, e.g. iphone 16"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              className="h-12 w-full rounded-xl border border-neutral-300 bg-white pl-10 pr-3 text-ink placeholder:text-neutral-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              aria-label="Search item"
            />
          </div>
        )}

        {open && !picked && query.trim() && (
          <ul
            className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-xl"
            role="listbox"
          >
            {matches.map((m, i) => (
              <li key={m.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => pick(m)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-3 text-left ${i === active ? 'bg-brand-50' : ''}`}
                >
                  <span className="font-medium text-ink">{m.name}</span>
                  {m.defaultPricePaise !== null ? (
                    <span className="tabular shrink-0 text-sm text-neutral-500">{formatINR(m.defaultPricePaise, { short: true })}</span>
                  ) : null}
                </button>
              </li>
            ))}
            {showCustom ? (
              <li role="option" aria-selected={active === matches.length}>
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => pick(null)}
                  className={`flex w-full items-center gap-2 px-3 py-3 text-left text-brand-700 ${active === matches.length ? 'bg-brand-50' : ''}`}
                >
                  <PlusCircle size={18} /> Add "{query.trim()}" as an unlisted item
                </button>
              </li>
            ) : null}
            {!options ? <li className="px-3 py-3 text-sm text-neutral-500">No item matches. Ask the admin to add it.</li> : null}
          </ul>
        )}
      </div>

      <div className="mt-2 flex items-end gap-2">
        <div className="shrink-0">
          <span className="mb-1 block text-xs font-medium text-neutral-500">Qty</span>
          <div className="flex h-12 items-center rounded-xl border border-neutral-300 bg-white">
            <button
              type="button"
              className="h-full px-2.5 text-brand-700 disabled:text-neutral-300"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              aria-label="Less"
            >
              <Minus size={18} />
            </button>
            <input
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.min(9999, Number(e.target.value.replace(/\D/g, '')) || 1)))}
              inputMode="numeric"
              className="tabular w-9 bg-transparent text-center font-semibold focus:outline-none"
              aria-label="Quantity"
            />
            <button
              type="button"
              className="h-full px-2.5 text-brand-700"
              onClick={() => setQty((q) => Math.min(9999, q + 1))}
              aria-label="More"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-medium text-neutral-500">Rate (₹, incl. GST)</span>
          <input
            ref={rateRef}
            value={rateText}
            onChange={(e) => setRateText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && canAdd && add()}
            inputMode="decimal"
            enterKeyHint="done"
            placeholder="0"
            disabled={!picked}
            className={`tabular h-12 w-full rounded-xl border bg-white px-3 text-right font-semibold focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-neutral-50 ${
              rateText && ratePaise === null ? 'border-red-400' : 'border-neutral-300 focus:border-brand-600'
            }`}
          />
        </label>
        <button
          type="button"
          onClick={add}
          disabled={!canAdd}
          className="flex h-12 shrink-0 items-center gap-1 rounded-xl bg-brand-700 px-4 font-semibold text-white active:bg-brand-800 disabled:bg-brand-200"
        >
          <Plus size={18} /> Add
        </button>
      </div>
    </div>
  );
}
