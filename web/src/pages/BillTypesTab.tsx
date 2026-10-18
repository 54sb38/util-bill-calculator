import { zodResolver } from '@hookform/resolvers/zod';
import { billTypeCreate, SPLIT_METHOD_LABELS, SPLIT_METHODS, type BillTypeDto } from '@bill/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useBillTypes, useCreateBillType, useDeleteBillType, useUpdateBillType } from '../api/hooks';
import { Button, Card, EmptyState, ErrorMessage, Field, Input, Loading, SectionHeader, Select } from '../components/ui';
import { useHomeContext } from './HomeLayout';

const methodOptions = SPLIT_METHODS.map((m) => (
  <option key={m} value={m}>
    {SPLIT_METHOD_LABELS[m]}
  </option>
));

export function BillTypesTab() {
  const { home } = useHomeContext();
  const types = useBillTypes(home.id);

  return (
    <div className="space-y-6">
      <SectionHeader title="Bill types" />
      <p className="-mt-2 text-sm text-slate-500">
        Each bill belongs to one of these types. The default split method is pre-selected for new bills and can
        be changed per bill.
      </p>
      {types.isPending ? (
        <Loading />
      ) : types.isError ? (
        <ErrorMessage error={types.error} />
      ) : types.data.length === 0 ? (
        <EmptyState title="No bill types yet">Add e.g. Electricity, Gas, Water or Internet below.</EmptyState>
      ) : (
        <Card className="divide-y divide-slate-100">
          {types.data.map((t) => (
            <BillTypeRow key={t.id} type={t} />
          ))}
        </Card>
      )}
      <NewBillTypeForm homeId={home.id} />
    </div>
  );
}

function BillTypeRow({ type }: { type: BillTypeDto }) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateBillType();
  const remove = useDeleteBillType();
  const form = useForm({
    resolver: zodResolver(billTypeCreate),
    values: { name: type.name, defaultSplitMethod: type.defaultSplitMethod },
  });

  const onSave = form.handleSubmit((values) =>
    update.mutate({ id: type.id, ...values }, { onSuccess: () => setEditing(false) }),
  );

  const onDelete = () => {
    if (window.confirm(`Delete bill type "${type.name}"?`)) remove.mutate(type.id);
  };

  if (editing) {
    return (
      <form onSubmit={onSave} className="flex flex-wrap items-start gap-2 p-3">
        <Input {...form.register('name')} className="w-48" aria-label="Name" autoFocus />
        <Select {...form.register('defaultSplitMethod')} className="w-48" aria-label="Default split method">
          {methodOptions}
        </Select>
        <Button type="submit" variant="primary" size="sm" disabled={update.isPending}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <ErrorMessage error={form.formState.errors.name ?? update.error} className="w-full" />
      </form>
    );
  }

  return (
    <div className="p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-40 flex-1">
          <p className="font-medium text-slate-900">{type.name}</p>
          <p className="text-xs text-slate-500">
            Default: {SPLIT_METHOD_LABELS[type.defaultSplitMethod]} · {type.billCount}{' '}
            {type.billCount === 1 ? 'bill' : 'bills'}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600"
          onClick={onDelete}
          disabled={remove.isPending}
          title={type.billCount > 0 ? 'Bill types used by bills cannot be deleted' : undefined}
        >
          Delete
        </Button>
      </div>
      <ErrorMessage error={remove.error} className="mt-2" />
    </div>
  );
}

function NewBillTypeForm({ homeId }: { homeId: number }) {
  const create = useCreateBillType(homeId);
  const form = useForm({
    resolver: zodResolver(billTypeCreate),
    defaultValues: { name: '', defaultSplitMethod: 'by_days' as const },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => create.mutate(values, { onSuccess: () => form.reset() }));

  return (
    <Card className="p-4">
      <h3 className="mb-3 font-medium text-slate-900">Add a bill type</h3>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
        <Field label="Name" error={errors.name?.message}>
          <Input {...form.register('name')} placeholder="e.g. Electricity" aria-invalid={!!errors.name} />
        </Field>
        <Field label="Default split method">
          <Select {...form.register('defaultSplitMethod')}>{methodOptions}</Select>
        </Field>
        <Button type="submit" variant="primary" className="sm:mt-5" disabled={create.isPending}>
          Add
        </Button>
      </form>
      <ErrorMessage error={create.error} className="mt-3" />
    </Card>
  );
}
