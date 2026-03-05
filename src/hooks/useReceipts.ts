import { useState, useCallback, useEffect } from 'react';
import { Receipt } from '../types/database';
import * as receiptsApi from '../api/receipts';
import { useAuthContext } from '../contexts/AuthContext';
import { useRealtime, RealtimePayload } from './useRealtime';

export const useReceipts = (tripId: string) => {
  const { user } = useAuthContext();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await receiptsApi.getReceipts(tripId);
      setReceipts(data);
    } catch (e) {
      console.error('Receipts fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { fetchReceipts(); }, [fetchReceipts]);

  // Realtime updates
  const handleRealtime = useCallback((payload?: RealtimePayload) => {
    if (!payload) { fetchReceipts(); return; }
    const { eventType } = payload;
    if (eventType === 'INSERT' && payload.new) {
      const newReceipt = payload.new as unknown as Receipt;
      setReceipts(prev => prev.some(r => r.id === newReceipt.id) ? prev : [newReceipt, ...prev]);
    } else if (eventType === 'UPDATE' && payload.new) {
      const updated = payload.new as unknown as Receipt;
      setReceipts(prev => prev.map(r => r.id === updated.id ? updated : r));
    } else if (eventType === 'DELETE' && payload.old) {
      const deletedId = (payload.old as any).id;
      setReceipts(prev => prev.filter(r => r.id !== deletedId));
    } else {
      fetchReceipts();
    }
  }, [fetchReceipts]);

  useRealtime('receipts', `trip_id=eq.${tripId}`, handleRealtime);

  const addReceipt = useCallback(async (
    receipt: Omit<Receipt, 'id' | 'created_at' | 'updated_at'>
  ) => {
    const created = await receiptsApi.createReceipt(receipt);
    setReceipts(prev => [created, ...prev]);
    return created;
  }, []);

  const updateReceipt = useCallback(async (
    id: string,
    updates: Parameters<typeof receiptsApi.updateReceipt>[1]
  ) => {
    const updated = await receiptsApi.updateReceipt(id, updates);
    setReceipts(prev => prev.map(r => r.id === id ? updated : r));
    return updated;
  }, []);

  const removeReceipt = useCallback(async (id: string) => {
    setReceipts(prev => prev.filter(r => r.id !== id));
    await receiptsApi.deleteReceipt(id);
  }, []);

  const completeReceipt = useCallback(async (receipt: Receipt) => {
    if (!user) return;
    // Generate expenses from receipt items
    await receiptsApi.generateExpensesFromReceipt(receipt, user.id);
    // Update status to completed
    const updated = await receiptsApi.updateReceipt(receipt.id, { status: 'completed' });
    setReceipts(prev => prev.map(r => r.id === receipt.id ? updated : r));
    return updated;
  }, [user]);

  const reopenReceipt = useCallback(async (id: string) => {
    // Delete generated expenses and set back to in_progress
    await receiptsApi.deleteExpensesByReceiptId(id);
    const updated = await receiptsApi.updateReceipt(id, { status: 'in_progress' });
    setReceipts(prev => prev.map(r => r.id === id ? updated : r));
    return updated;
  }, []);

  return {
    receipts,
    loading,
    addReceipt,
    updateReceipt,
    removeReceipt,
    completeReceipt,
    reopenReceipt,
    refresh: fetchReceipts,
  };
};
