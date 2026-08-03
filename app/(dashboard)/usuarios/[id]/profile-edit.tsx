"use client";

import { useState, useTransition } from "react";
import { Check, Pencil } from "lucide-react";
import { updateUserProfileAction, setUserLevelAction, type PlayerLevel } from "./actions";

/** Enum user_gender, com o rótulo que o painel mostra. Vive aqui e não em
    actions.ts porque um módulo "use server" só pode exportar funções async. */
const GENDER_OPTIONS = [
  { value: "male", label: "Masculino" },
  { value: "female", label: "Feminino" },
  { value: "non_binary", label: "Não binário" },
  { value: "prefer_not_say", label: "Prefere não dizer" },
] as const;

/** Enum category_skill. "none" é valor de fio de verdade — significa
    profiles.category IS NULL ("não nivelado"), não é placeholder de UI. */
const CATEGORY_OPTIONS = ["A", "B", "C", "D", "PRO"] as const;

const fieldClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none";
const labelClass = "label-colus mb-1.5 block text-[8.5px] text-[var(--text-tertiary)]";

const genderLabel = (v: string) =>
  GENDER_OPTIONS.find((g) => g.value === v)?.label ?? v;

/** "" na tela (não nivelado) é "none" no fio. */
const toWireLevel = (v: string): PlayerLevel => (v === "" ? "none" : (v as PlayerLevel));

/**
 * Edição do que o staff pode corrigir no perfil: e-mail, gênero e categoria.
 * Tudo se muda aqui, na página da pessoa (decisão do founder 03/08).
 *
 * MAS A CATEGORIA NÃO VAI PELO MESMO CANO DOS OUTROS DOIS, e isso é de
 * propósito. E-mail e gênero seguem no PATCH /v1/ops/users/{id}; categoria vai
 * no PUT /v1/ops/users/{id}/level, que EXIGE motivo e grava em
 * lits.ops_audit_log junto com o e-mail de quem mexeu e a transição de → para.
 * Nivelamento decide com quem a pessoa é pareada; mudar isso sem registro é
 * exatamente o que ninguém consegue reconstruir uma semana depois, e foi o
 * motivo desse endpoint existir em vez de um UPDATE na mão no banco.
 *
 * Por isso o campo de motivo aparece SÓ quando a categoria muda: ele é o preço
 * daquela mudança específica, não burocracia em cima de corrigir um e-mail
 * digitado errado.
 *
 * Salvamento em duas chamadas, e o resultado parcial é dito na cara: se uma
 * passar e a outra falhar, a tela mostra o que gravou e o que não gravou em vez
 * de um "erro" que faria o staff repetir a parte que já tinha ido.
 *
 * `hasProfile` falso = conta sem onboarding: gênero e categoria não têm onde
 * ser gravados, então os selects saem de cena em vez de aceitarem uma edição
 * que o serviço recusaria com 422.
 */
export function ProfileEdit({
  userId,
  initialEmail,
  initialGender,
  initialCategory,
  hasProfile,
}: {
  userId: string;
  initialEmail: string;
  initialGender: string;
  initialCategory: string;
  hasProfile: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [gender, setGender] = useState(initialGender);
  const [category, setCategory] = useState(initialCategory);
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState<{ email: string; gender: string; category: string } | null>(
    null
  );
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const current = saved ?? {
    email: initialEmail,
    gender: initialGender,
    category: initialCategory,
  };

  const categoryChanged = category !== current.category;
  const profileChanged = email !== current.email || gender !== current.gender;

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="text-[12px] font-300 text-[var(--text-secondary)]">
          <span className="label-colus mr-2 text-[8.5px] text-[var(--text-tertiary)]">Email</span>
          {current.email || <span className="text-[var(--text-tertiary)]">sem e-mail</span>}
        </p>
        {hasProfile && (
          <>
            <p className="text-[12px] font-300 text-[var(--text-secondary)]">
              <span className="label-colus mr-2 text-[8.5px] text-[var(--text-tertiary)]">
                Gênero
              </span>
              {current.gender ? (
                genderLabel(current.gender)
              ) : (
                <span className="text-[var(--text-tertiary)]">não informado</span>
              )}
            </p>
            <p className="text-[12px] font-300 text-[var(--text-secondary)]">
              <span className="label-colus mr-2 text-[8.5px] text-[var(--text-tertiary)]">
                Categoria
              </span>
              {current.category || (
                <span className="text-[var(--text-tertiary)]">não nivelado</span>
              )}
            </p>
          </>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-[11.5px] font-500 text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        >
          <Pencil size={11} strokeWidth={2} />
          Editar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3.5 rounded-lg border border-[var(--border)] bg-[var(--bg)]/40 px-4 py-4">
      <div className={hasProfile ? "grid gap-3 sm:grid-cols-3" : ""}>
        <div>
          <label htmlFor="profile_email" className={labelClass}>
            Email
          </label>
          <input
            id="profile_email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nome@dominio.com"
            className={fieldClass}
          />
        </div>

        {hasProfile && (
          <>
            <div>
              <label htmlFor="profile_gender" className={labelClass}>
                Gênero
              </label>
              <select
                id="profile_gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className={fieldClass}
              >
                <option value="">— não informado —</option>
                {GENDER_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="profile_category" className={labelClass}>
                Categoria
              </label>
              <select
                id="profile_category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={fieldClass}
              >
                <option value="">— não nivelado —</option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* O motivo só entra em cena quando a categoria muda — é o preço daquela
          mudança, não pedágio pra corrigir e-mail. */}
      {categoryChanged && (
        <div>
          <label htmlFor="profile_level_reason" className={labelClass}>
            Motivo da mudança de nível <span className="text-[var(--color-error)]">*</span>
          </label>
          <input
            id="profile_level_reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="ex.: reavaliado no treino de sábado"
            className={fieldClass}
          />
          <p className="mt-1.5 text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
            Fica registrado com teu e-mail e a transição{" "}
            {current.category || "não nivelado"} → {category || "não nivelado"}.
          </p>
        </div>
      )}

      <p className="text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
        {hasProfile
          ? "Deixar um campo em branco mantém o valor atual — esta edição não apaga dados. A categoria aqui é a nivelada, não a declarada no onboarding."
          : "Esta conta não concluiu o onboarding e não tem perfil: só o e-mail pode ser editado."}
      </p>

      {error && (
        <p className="rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error-bg)] px-3 py-2 text-[11.5px] text-[var(--color-error)]">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || (categoryChanged && reason.trim() === "")}
          onClick={() =>
            startTransition(async () => {
              setError("");

              // Nível primeiro: é a mudança que exige motivo e deixa trilha. Se
              // ela falhar, nem tenta o resto — assim o staff não fica com
              // e-mail gravado e nível não, sem saber qual repetir.
              let nextCategory = current.category;
              if (categoryChanged) {
                const lv = await setUserLevelAction(userId, toWireLevel(category), reason.trim());
                if (!lv.ok) {
                  setError(lv.error);
                  return;
                }
                nextCategory = lv.data.level === "none" ? "" : lv.data.level;
              }

              let nextEmail = current.email;
              let nextGender = current.gender;
              if (profileChanged) {
                const res = await updateUserProfileAction(userId, { email, gender });
                if (!res.ok) {
                  // O nível JÁ gravou. Dizer só "falhou" faria o staff repetir
                  // tudo e gerar uma segunda entrada de auditoria pra uma
                  // mudança que já aconteceu.
                  setError(
                    categoryChanged
                      ? `Nível gravado (${nextCategory || "não nivelado"}), mas e-mail/gênero não: ${res.error}`
                      : res.error
                  );
                  setSaved({ email: nextEmail, gender: nextGender, category: nextCategory });
                  setReason("");
                  return;
                }
                nextEmail = res.data.email ?? email;
                nextGender = res.data.gender ?? gender;
              }

              setSaved({ email: nextEmail, gender: nextGender, category: nextCategory });
              setReason("");
              setOpen(false);
            })
          }
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2 text-[11.5px] font-600 text-[var(--primary-fg)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Check size={12} strokeWidth={2.5} />
          {pending ? "Salvando…" : "Salvar perfil"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError("");
            setEmail(current.email);
            setGender(current.gender);
            setCategory(current.category);
            setReason("");
          }}
          className="text-[11.5px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
