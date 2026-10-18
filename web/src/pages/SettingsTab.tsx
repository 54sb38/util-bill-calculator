import { zodResolver } from '@hookform/resolvers/zod';
import { homeUpdate } from '@bill/shared';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { useDeleteHome, useUpdateHome } from '../api/hooks';
import { Button, Card, ErrorMessage, Field, Input, SectionHeader, Textarea } from '../components/ui';
import { useHomeContext } from './HomeLayout';

export function SettingsTab() {
  const { home } = useHomeContext();
  const navigate = useNavigate();
  const update = useUpdateHome(home.id);
  const remove = useDeleteHome();
  const form = useForm({
    resolver: zodResolver(homeUpdate),
    values: {
      name: home.name,
      address: home.address ?? '',
      notes: home.notes ?? '',
    },
  });
  const { errors, isDirty } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    update.mutate({ ...values, address: values.address || null, notes: values.notes || null }),
  );

  const onDelete = () => {
    const msg = `Delete "${home.name}" and ALL of its people, stays, bill types and bills? This cannot be undone.`;
    if (window.confirm(msg)) remove.mutate(home.id, { onSuccess: () => navigate('/') });
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <SectionHeader title="Home details" />
        <form onSubmit={onSubmit} className="grid max-w-xl gap-3">
          <Field label="Name" error={errors.name?.message}>
            <Input {...form.register('name')} aria-invalid={!!errors.name} />
          </Field>
          <Field label="Address" error={errors.address?.message}>
            <Input {...form.register('address')} />
          </Field>
          <Field label="Notes" error={errors.notes?.message}>
            <Textarea {...form.register('notes')} />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={!isDirty || update.isPending}>
              Save changes
            </Button>
            {update.isSuccess && !isDirty && <span className="text-sm text-emerald-700">Saved</span>}
          </div>
          <ErrorMessage error={update.error} />
        </form>
      </Card>

      <Card className="p-4 ring-red-200">
        <h3 className="font-medium text-red-700">Delete home</h3>
        <p className="mt-1 text-sm text-slate-600">
          Permanently removes this home with all of its people, stays, bill types and bills.
        </p>
        <Button variant="danger" className="mt-3" onClick={onDelete} disabled={remove.isPending}>
          Delete this home
        </Button>
        <ErrorMessage error={remove.error} className="mt-3" />
      </Card>
    </div>
  );
}
