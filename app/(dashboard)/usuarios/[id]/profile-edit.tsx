"use client";

import { useState, useTransition } from "react";
import { Check, Pencil } from "lucide-react";
import { updateUserProfileAction } from "./actions";

/** Enum user_gender, com o rótulo que o painel mostra. Vive aqui e não em
    actions.ts porque um módulo "use server" só pode exportar funções async. */
const GENDER_OPTIONS = [
  { value: "male", label: "Masculino" },
  { value: "female", label: "Feminino" },
  { value: "non_binary", label: "Não binário" },
  { value: "prefer_not_say", label: "Prefere não dizer" },
] as const;

const fieldClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[12.5px] text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:outline-none";
const labelClass = "label-colus mb-1.5 block text-[8.5px] text-[var(--text-tertiary)]";

const genderLabel = (v: string) =>
  GENDER_OPTIONS.find((g) => g.value === v)?.label ?? v;

/**
 * Edição do que o staff pode corrigir no perfil: e-mail e gênero.
 *
 * CATEGORIA NÃO ESTÁ AQUI DE PROPÓSITO (decisão do founder 03/08). Ela também
 * é `profiles.category`, e por um tempo teve DOIS editores nesta mesma página —
 * "Categoria" neste formulário e "Nível" no bloco Ações. Mesmo campo, dois
 * nomes, dois caminhos. O que decidiu a disputa não foi estética: o caminho
 * daqui (PATCH /v1/ops/users/{id}) grava sem deixar rastro, enquanto o do bloco
 * Ações (PUT /v1/ops/users/{id}/level) exige motivo e escreve em
 * lits.ops_audit_log. Nivelamento muda com quem a pessoa é pareada; mudar isso
 * sem registrar quem fez e por quê é o tipo de coisa que ninguém consegue
 * reconstruir uma semana depois. Se for pra trazer categoria de volta pra cá,
 * traga o motivo obrigatório junto — senão é regressão de auditoria.
 *
 * Um formulário só, salvo de uma vez — os dois campos vivem em tabelas
 * diferentes, mas para quem opera é "o perfil desta pessoa", e o backend grava
 * tudo numa transação. Campos em branco não limpam nada (o endpoint é esparso
 * por contrato); por isso o e-mail já nasce com o valor atual e o select tem o
 * estado corrente selecionado.
 *
 * `hasProfile` falso = conta sem onboarding: gênero não tem onde ser gravado,
 * então o select sai de cena em vez de aceitar uma edição que o serviço
 * recusaria com 422.
 */
export function ProfileEdit({
  userId,
  initialEmail,
  initialGender,
  hasProfile,
}: {
  userId: string;
  initialEmail: string;
  initialGender: string;
  hasProfile: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [gender, setGender] = useState(initialGender);
  const [saved, setSaved] = useState<{ email: string; gender: string } | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const current = saved ?? {
    email: initialEmail,
    gender: initialGender,
  };

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="text-[12px] font-300 text-[var(--text-secondary)]">
          <span className="label-colus mr-2 text-[8.5px] text-[var(--text-tertiary)]">Email</span>
          {current.email || <span className="text-[var(--text-tertiary)]">sem e-mail</span>}
        </p>
        {hasProfile && (
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
      <div className={hasProfile ? "grid gap-3 sm:grid-cols-2" : ""}>
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
        )}
      </div>

      <p className="text-[10.5px] font-300 leading-snug text-[var(--text-tertiary)]">
        {hasProfile
          ? "Deixar um campo em branco mantém o valor atual — esta edição não apaga dados. Nível do jogador se muda no bloco Ações, onde o motivo é obrigatório e fica registrado."
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
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError("");
              const res = await updateUserProfileAction(userId, { email, gender });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setSaved({
                email: res.data.email ?? email,
                gender: res.data.gender ?? gender,
              });
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
          }}
          className="text-[11.5px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
