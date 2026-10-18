import { zodResolver } from '@hookform/resolvers/zod';
import { homeCreate } from '@bill/shared';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { useCreateHome, useHomes } from '../api/hooks';
import { Button, Card, EmptyState, ErrorMessage, Field, Input, Loading, SectionHeader } from '../components/ui';

export function HomesPage() {
  const homes = useHomes();
  return (
    <div className="space-y-8">
      <section>
        <SectionHeader title="Homes" />
        {homes.isPending ? (
          <Loading />
        ) : homes.isError ? (
          <ErrorMessage error={homes.error} />
        ) : homes.data.length === 0 ? (
          <EmptyState title="No homes yet">Create one below to start splitting bills.</EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {homes.data.map((h) => (
              <li key={h.id}>
                <Link to={`/homes/${h.id}`} className="block h-full">
                  <Card className="h-full p-4 transition hover:ring-emerald-400">
                    <p className="font-semibold text-slate-900">{h.name}</p>
                    {h.address && <p className="mt-0.5 text-sm text-slate-500">{h.address}</p>}
                    <p className="mt-3 text-xs text-slate-500">
                      {h.peopleCount} {h.peopleCount === 1 ? 'person' : 'people'} · {h.billCount}{' '}
                      {h.billCount === 1 ? 'bill' : 'bills'}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <NewHomeForm />
    </div>
  );
}

function NewHomeForm() {
  const navigate = useNavigate();
  const create = useCreateHome();
  const form = useForm({
    resolver: zodResolver(homeCreate),
    defaultValues: { name: '', address: '' },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    create.mutate(
      { ...values, address: values.address || null },
      { onSuccess: (home) => navigate(`/homes/${home.id}/people`) },
    ),
  );

  return (
    <Card className="p-4">
      <h3 className="mb-3 font-medium text-slate-900">Add a home</h3>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[2fr_3fr_auto] sm:items-start">
        <Field label="Name" error={errors.name?.message}>
          <Input {...form.register('name')} placeholder="e.g. Flat on King St" aria-invalid={!!errors.name} />
        </Field>
        <Field label="Address (optional)" error={errors.address?.message}>
          <Input {...form.register('address')} />
        </Field>
        <Button type="submit" variant="primary" className="sm:mt-5" disabled={create.isPending}>
          Create
        </Button>
      </form>
      <ErrorMessage error={create.error} className="mt-3" />
    </Card>
  );
}
