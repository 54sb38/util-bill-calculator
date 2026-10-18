import { zodResolver } from '@hookform/resolvers/zod';
import { isoDate, personCreate, weight, type PersonDto, type StayDto } from '@bill/shared';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  useCreatePerson,
  useCreateStay,
  useDeletePerson,
  useDeleteStay,
  usePeople,
  useUpdatePerson,
  useUpdateStay,
} from '../api/hooks';
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, Input, Loading, SectionHeader } from '../components/ui';
import { formatDate, formatRange, todayIso, toDayNumber } from '../lib/dates';
import { useHomeContext } from './HomeLayout';

interface Scale {
  start: number;
  end: number;
}

export function PeopleTab() {
  const { home } = useHomeContext();
  const [showArchived, setShowArchived] = useState(false);
  const people = usePeople(home.id, showArchived);

  // One shared time scale so everyone's timelines line up.
  const scale = useMemo<Scale | null>(() => {
    const stays = (people.data ?? []).flatMap((p) => p.stays);
    if (stays.length === 0) return null;
    const today = toDayNumber(todayIso());
    const starts = stays.map((s) => toDayNumber(s.startDate));
    const ends = stays.map((s) => (s.endDate ? toDayNumber(s.endDate) : today));
    return { start: Math.min(...starts), end: Math.max(today, ...ends) };
  }, [people.data]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="People"
        actions={
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-emerald-600"
            />
            Show archived
          </label>
        }
      />
      <p className="-mt-2 text-sm text-slate-500">
        Record when each person lives here. A holiday is a gap between two stays; people are only charged for
        days they were present on “by days” bills.
      </p>

      {people.isPending ? (
        <Loading />
      ) : people.isError ? (
        <ErrorMessage error={people.error} />
      ) : people.data.length === 0 ? (
        <EmptyState title="Nobody here yet">Add the people who share this home below.</EmptyState>
      ) : (
        <div className="space-y-3">
          {scale && (
            <p className="text-right text-xs text-slate-400">
              Timeline: {formatDate(fromDay(scale.start))} – {formatDate(fromDay(scale.end))}
            </p>
          )}
          {people.data.map((p) => (
            <PersonCard key={p.id} person={p} scale={scale} />
          ))}
        </div>
      )}

      <NewPersonForm homeId={home.id} />
    </div>
  );
}

const fromDay = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);

// ---------- Person ----------

const personForm = z.object({ name: personCreate.shape.name, defaultWeight: weight });

function PersonCard({ person, scale }: { person: PersonDto; scale: Scale | null }) {
  const [editing, setEditing] = useState(false);
  const [addingStay, setAddingStay] = useState(false);
  const update = useUpdatePerson();
  const remove = useDeletePerson();
  const createStay = useCreateStay();
  const archived = person.archivedAt !== null;

  const onDelete = () => {
    if (window.confirm(`Delete ${person.name} and all of their stays?`)) remove.mutate(person.id);
  };

  return (
    <Card className={archived ? 'p-4 opacity-75' : 'p-4'}>
      {editing ? (
        <PersonForm
          person={person}
          onDone={() => setEditing(false)}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-slate-900">{person.name}</h3>
          {person.defaultWeight !== 1 && (
            <Badge tone="sky" title="Default weight for 'by weights' bills">
              weight {person.defaultWeight}
            </Badge>
          )}
          {archived && <Badge>archived</Badge>}
          <div className="ml-auto flex flex-wrap gap-1">
            <Button size="sm" variant="ghost" aria-label={`Edit ${person.name}`} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => update.mutate({ id: person.id, archived: !archived })}
              disabled={update.isPending}
              title={archived ? undefined : 'Hide a former housemate but keep their bill history'}
            >
              {archived ? 'Unarchive' : 'Archive'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600"
              aria-label={`Delete ${person.name}`}
              onClick={onDelete}
              disabled={remove.isPending}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
      <ErrorMessage error={remove.error ?? update.error} className="mt-2" />

      {scale && person.stays.length > 0 && <Timeline stays={person.stays} scale={scale} />}

      <div className="mt-3">
        {person.stays.length === 0 && !addingStay && (
          <p className="text-sm text-slate-500">No stays yet, so {person.name} won’t be included in bills automatically.</p>
        )}
        <ul className="space-y-1">
          {person.stays.map((s, i) => (
            <li key={s.id}>
              {i > 0 && <Gap previous={person.stays[i - 1]!} next={s} />}
              <StayRow stay={s} />
            </li>
          ))}
        </ul>
        {addingStay ? (
          <StayForm
            submitLabel="Add stay"
            pending={createStay.isPending}
            error={createStay.error}
            onCancel={() => {
              createStay.reset();
              setAddingStay(false);
            }}
            onSubmit={async (values) => {
              await createStay.mutateAsync({ personId: person.id, ...values });
              setAddingStay(false);
            }}
          />
        ) : (
          <Button size="sm" variant="ghost" className="mt-2 text-emerald-700" onClick={() => setAddingStay(true)}>
            + Add stay
          </Button>
        )}
      </div>
    </Card>
  );
}

function PersonForm({ person, onDone }: { person: PersonDto; onDone: () => void }) {
  const update = useUpdatePerson();
  const form = useForm({
    resolver: zodResolver(personForm),
    defaultValues: { name: person.name, defaultWeight: person.defaultWeight },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    update.mutate({ id: person.id, ...values }, { onSuccess: onDone }),
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-3">
      <Field label="Name" error={errors.name?.message}>
        <Input {...form.register('name')} autoFocus aria-invalid={!!errors.name} />
      </Field>
      <Field label="Default weight" error={errors.defaultWeight?.message}>
        <Input
          type="number"
          step="any"
          min="0.001"
          className="w-28"
          {...form.register('defaultWeight', { valueAsNumber: true })}
        />
      </Field>
      <div className="flex gap-2 sm:mt-5">
        <Button type="submit" size="sm" variant="primary" disabled={update.isPending}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <ErrorMessage error={update.error} className="w-full" />
    </form>
  );
}

function NewPersonForm({ homeId }: { homeId: number }) {
  const create = useCreatePerson(homeId);
  const form = useForm({
    resolver: zodResolver(personForm),
    defaultValues: { name: '', defaultWeight: 1 },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => create.mutate(values, { onSuccess: () => form.reset() }));

  return (
    <Card className="p-4">
      <h3 className="mb-3 font-medium text-slate-900">Add a person</h3>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-start">
        <Field label="Name" error={errors.name?.message}>
          <Input {...form.register('name')} aria-invalid={!!errors.name} />
        </Field>
        <Field
          label="Default weight"
          error={errors.defaultWeight?.message}
          hint="Used by “by weights” bills, e.g. 2 for a bigger room"
        >
          <Input type="number" step="any" min="0.001" {...form.register('defaultWeight', { valueAsNumber: true })} />
        </Field>
        <Button type="submit" variant="primary" className="sm:mt-5" disabled={create.isPending}>
          Add
        </Button>
      </form>
      <ErrorMessage error={create.error} className="mt-3" />
    </Card>
  );
}

// ---------- Stays ----------

function Timeline({ stays, scale }: { stays: StayDto[]; scale: Scale }) {
  const span = scale.end - scale.start + 1;
  const today = toDayNumber(todayIso());
  return (
    <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
      {stays.map((s) => {
        const start = toDayNumber(s.startDate);
        const end = s.endDate ? toDayNumber(s.endDate) : Math.max(today, start);
        return (
          <div
            key={s.id}
            className="absolute inset-y-0 rounded-full bg-emerald-500"
            style={{
              left: `${((start - scale.start) / span) * 100}%`,
              width: `${(Math.max(1, end - start + 1) / span) * 100}%`,
            }}
            title={formatRange(s.startDate, s.endDate)}
          />
        );
      })}
    </div>
  );
}

function Gap({ previous, next }: { previous: StayDto; next: StayDto }) {
  if (!previous.endDate) return null;
  const days = toDayNumber(next.startDate) - toDayNumber(previous.endDate) - 1;
  if (days <= 0) return null;
  return (
    <p className="py-0.5 pl-3 text-xs text-amber-700">
      ↳ away {days} {days === 1 ? 'day' : 'days'}
    </p>
  );
}

function StayRow({ stay }: { stay: StayDto }) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateStay();
  const remove = useDeleteStay();

  if (editing) {
    return (
      <StayForm
        initial={stay}
        submitLabel="Save"
        pending={update.isPending}
        error={update.error}
        onCancel={() => {
          update.reset();
          setEditing(false);
        }}
        onSubmit={async (values) => {
          await update.mutateAsync({ id: stay.id, ...values });
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div className="group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-1.5 text-sm hover:bg-slate-50">
      <span className="font-medium text-slate-700">{formatRange(stay.startDate, stay.endDate)}</span>
      {!stay.endDate && <Badge tone="emerald">current</Badge>}
      {stay.note && <span className="text-slate-500">{stay.note}</span>}
      <span className="ml-auto flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        <Button size="sm" variant="ghost" aria-label="Edit stay" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600"
          aria-label="Delete stay"
          disabled={remove.isPending}
          onClick={() => window.confirm('Delete this stay?') && remove.mutate(stay.id)}
        >
          Delete
        </Button>
      </span>
      <ErrorMessage error={remove.error} className="w-full" />
    </div>
  );
}

const stayForm = z
  .object({
    startDate: isoDate,
    endDate: z.union([isoDate, z.literal('')]),
    note: z.string().trim().max(500),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });

interface StayValues {
  startDate: string;
  endDate: string | null;
  note: string | null;
}

function StayForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: StayDto;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (values: StayValues) => Promise<void>;
  onCancel: () => void;
}) {
  const form = useForm({
    resolver: zodResolver(stayForm),
    defaultValues: {
      startDate: initial?.startDate ?? todayIso(),
      endDate: initial?.endDate ?? '',
      note: initial?.note ?? '',
    },
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit((v) =>
    onSubmit({ startDate: v.startDate, endDate: v.endDate || null, note: v.note || null }).catch(() => {
      // Error is shown via the mutation's `error`.
    }),
  );

  return (
    <form onSubmit={submit} className="mt-2 rounded-md bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr] sm:items-start">
        <Field label="From" error={errors.startDate?.message}>
          <Input type="date" {...form.register('startDate')} aria-invalid={!!errors.startDate} />
        </Field>
        <Field label="To" error={errors.endDate?.message} hint="Leave empty if still living here">
          <Input type="date" {...form.register('endDate')} aria-invalid={!!errors.endDate} />
        </Field>
        <Field label="Note (optional)" error={errors.note?.message}>
          <Input {...form.register('note')} placeholder="e.g. back from holiday" />
        </Field>
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={pending}>
          {submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <ErrorMessage error={error} className="mt-2" />
    </form>
  );
}
