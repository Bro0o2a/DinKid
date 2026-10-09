"use client";

import { Hand, ShoppingBasket } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ListItem, Profile } from "@/lib/types";
import { useRealtime } from "@/lib/useFamily";
import { useT } from "@/lib/i18n";

type Props = { familyId: string; userId: string; profiles: Record<string, Profile> };

export function Lists({ familyId, userId, profiles }: Props) {
  const [items, setItems] = useState<ListItem[]>([]);
  const [title, setTitle] = useState("");
  const [quantity, setQuantity] = useState("");
  const { t } = useT();

  const load = useCallback(async () => {
    const { data } = await supabase.from("list_items").select("*").eq("family_id", familyId).order("created_at");
    setItems(data ?? []);
  }, [familyId]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime("list_items", familyId, load);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const { error } = await supabase
      .from("list_items")
      .insert({ family_id: familyId, title: title.trim(), quantity: quantity.trim() || null });
    if (error) return alert(error.message);
    setTitle("");
    setQuantity("");
    load();
  }

  async function update(id: string, patch: Partial<ListItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    await supabase.from("list_items").update(patch).eq("id", id);
  }

  async function clearDone() {
    await supabase.from("list_items").delete().eq("family_id", familyId).eq("done", true);
    load();
  }

  const todo = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <form onSubmit={add} className="flex gap-2">
        <input dir="auto" placeholder={t("Add item, e.g. Khebez")} value={title} onChange={(e) => setTitle(e.target.value)} className="input flex-1" />
        <input dir="auto" placeholder={t("Qty")} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="input w-20" />
        <button className="btn-primary">{t("Add")}</button>
      </form>

      <section>
        <h2 className="section-title">{t("To get ({n})", { n: todo.length })}</h2>
        {todo.length === 0 && (
          <div className="flex flex-col items-center text-muted py-10 gap-2">
            <ShoppingBasket size={36} strokeWidth={1.5} />
            <p>{t("The list is empty. Yalla, add something!")}</p>
          </div>
        )}
        <ul className="space-y-2">
          {todo.map((item) => {
            const claimer = item.claimed_by ? profiles[item.claimed_by] : undefined;
            const mineClaim = item.claimed_by === userId;
            return (
              <li key={item.id} className="card p-3 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => update(item.id, { done: true })}
                  className="size-5 accent-[var(--brand)]"
                  aria-label={`Mark ${item.title} done`}
                />
                <div className="flex-1 min-w-0" dir="auto">
                  <p className="font-medium">
                    {item.title}
                    {item.quantity && <span className="text-muted font-normal"> × {item.quantity}</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {claimer ? (mineClaim ? t("You will get it") : t("{name} will get it", { name: claimer.display_name })) : t("Added by {name}", { name: profiles[item.created_by]?.display_name ?? t("someone") })}
                  </p>
                </div>
                <button
                  onClick={() => update(item.id, { claimed_by: mineClaim ? null : userId })}
                  className={`text-xs font-medium rounded-full px-3 py-1.5 border inline-flex items-center gap-1 ${mineClaim ? "border-brand bg-brand-soft text-brand" : "border-border text-muted hover:text-foreground"}`}
                >
                  <Hand size={13} /> {mineClaim ? t("Unclaim") : t("I'll get it")}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {done.length > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="section-title">{t("Done ({n})", { n: done.length })}</h2>
            <button onClick={clearDone} className="text-xs text-muted hover:underline mb-2">{t("Clear done")}</button>
          </div>
          <ul className="space-y-1">
            {done.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-3 py-1 text-muted">
                <input
                  type="checkbox"
                  checked
                  onChange={() => update(item.id, { done: false })}
                  className="size-5 accent-[var(--brand)]"
                  aria-label={t("Mark {item} not done", { item: item.title })}
                />
                <span className="line-through" dir="auto">{item.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
