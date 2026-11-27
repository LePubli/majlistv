'use client';
import { useMemo } from 'react';
import { useApp } from './Providers';
import TableGuard from './TableGuard';

export default function TableGuardMount() {
  const { t } = useApp();
  const labels = useMemo(() => ({ range: t('pgRange'), prev: t('pgPrev'), next: t('pgNext') }), [t]);
  return <TableGuard labels={labels} />;
}
