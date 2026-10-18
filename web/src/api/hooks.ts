import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import type {
  BillCreate,
  BillDetailDto,
  BillDto,
  BillPreview,
  BillTypeCreate,
  BillTypeDto,
  BillTypeUpdate,
  BillUpdate,
  HomeCreate,
  HomeDto,
  HomeUpdate,
  PersonCreate,
  PersonDto,
  PersonUpdate,
  PreviewDto,
  StayCreate,
  StayDto,
  StayUpdate,
  SummaryDto,
} from '@bill/shared';
import { api, qs } from './client';

// Every successful mutation invalidates all queries (see main.tsx), so hooks here only
// describe how to fetch and change data.

export interface BillFilters {
  typeId?: number;
  from?: string;
  to?: string;
}

// ---------- Homes ----------

export const useHomes = () =>
  useQuery({ queryKey: ['homes'], queryFn: () => api.get<HomeDto[]>('/homes') });

export const useHome = (homeId: number) =>
  useQuery({ queryKey: ['homes', homeId], queryFn: () => api.get<HomeDto>(`/homes/${homeId}`) });

export const useCreateHome = () =>
  useMutation({ mutationFn: (body: HomeCreate) => api.post<HomeDto>('/homes', body) });

export const useUpdateHome = (homeId: number) =>
  useMutation({ mutationFn: (body: HomeUpdate) => api.patch<HomeDto>(`/homes/${homeId}`, body) });

export const useDeleteHome = () =>
  useMutation({ mutationFn: (homeId: number) => api.delete(`/homes/${homeId}`) });

// ---------- People & stays ----------

export const usePeople = (homeId: number, includeArchived = false) =>
  useQuery({
    queryKey: ['homes', homeId, 'people', { includeArchived }],
    queryFn: () => api.get<PersonDto[]>(`/homes/${homeId}/people${qs({ includeArchived })}`),
  });

export const useCreatePerson = (homeId: number) =>
  useMutation({
    mutationFn: (body: PersonCreate) => api.post<PersonDto>(`/homes/${homeId}/people`, body),
  });

export const useUpdatePerson = () =>
  useMutation({
    mutationFn: ({ id, ...body }: PersonUpdate & { id: number }) =>
      api.patch<PersonDto>(`/people/${id}`, body),
  });

export const useDeletePerson = () =>
  useMutation({ mutationFn: (personId: number) => api.delete(`/people/${personId}`) });

export const useCreateStay = () =>
  useMutation({
    mutationFn: ({ personId, ...body }: StayCreate & { personId: number }) =>
      api.post<StayDto>(`/people/${personId}/stays`, body),
  });

export const useUpdateStay = () =>
  useMutation({
    mutationFn: ({ id, ...body }: StayUpdate & { id: number }) => api.patch<StayDto>(`/stays/${id}`, body),
  });

export const useDeleteStay = () =>
  useMutation({ mutationFn: (stayId: number) => api.delete(`/stays/${stayId}`) });

// ---------- Bill types ----------

export const useBillTypes = (homeId: number) =>
  useQuery({
    queryKey: ['homes', homeId, 'bill-types'],
    queryFn: () => api.get<BillTypeDto[]>(`/homes/${homeId}/bill-types`),
  });

export const useCreateBillType = (homeId: number) =>
  useMutation({
    mutationFn: (body: BillTypeCreate) => api.post<BillTypeDto>(`/homes/${homeId}/bill-types`, body),
  });

export const useUpdateBillType = () =>
  useMutation({
    mutationFn: ({ id, ...body }: BillTypeUpdate & { id: number }) =>
      api.patch<BillTypeDto>(`/bill-types/${id}`, body),
  });

export const useDeleteBillType = () =>
  useMutation({ mutationFn: (id: number) => api.delete(`/bill-types/${id}`) });

// ---------- Bills ----------

export const useBills = (homeId: number, filters: BillFilters = {}) =>
  useQuery({
    queryKey: ['homes', homeId, 'bills', filters],
    queryFn: () => api.get<BillDto[]>(`/homes/${homeId}/bills${qs({ ...filters })}`),
    placeholderData: keepPreviousData,
  });

export const useBill = (billId: number | undefined) =>
  useQuery({
    queryKey: ['bills', billId],
    queryFn: () => api.get<BillDetailDto>(`/bills/${billId}`),
    enabled: billId !== undefined,
  });

export const useCreateBill = (homeId: number) =>
  useMutation({
    mutationFn: (body: BillCreate) => api.post<BillDetailDto>(`/homes/${homeId}/bills`, body),
  });

export const useUpdateBill = () =>
  useMutation({
    mutationFn: ({ id, ...body }: BillUpdate & { id: number }) =>
      api.patch<BillDetailDto>(`/bills/${id}`, body),
  });

export const useDeleteBill = () =>
  useMutation({ mutationFn: (billId: number) => api.delete(`/bills/${billId}`) });

export const useRecalculateBill = () =>
  useMutation({
    mutationFn: (billId: number) => api.post<BillDetailDto>(`/bills/${billId}/recalculate`),
  });

/** Live share preview for the bill form. `body` is null while the form is incomplete. */
export const useBillPreview = (homeId: number, body: BillPreview | null) =>
  useQuery({
    queryKey: ['homes', homeId, 'preview', body],
    queryFn: () => api.post<PreviewDto>(`/homes/${homeId}/bills/preview`, body),
    enabled: body !== null,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });

// ---------- Summary ----------

export const useSummary = (homeId: number, range: { from?: string; to?: string }) =>
  useQuery({
    queryKey: ['homes', homeId, 'summary', range],
    queryFn: () => api.get<SummaryDto>(`/homes/${homeId}/summary${qs(range)}`),
    placeholderData: keepPreviousData,
  });
