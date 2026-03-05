import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  Image, ActivityIndicator, TextInput, Alert, Platform,
} from 'react-native';
import { Button } from '../common';
import { BudgetCategory } from '../../types/database';
import { CollaboratorWithProfile } from '../../api/invitations';
import { getDisplayName } from '../../utils/profileHelpers';
import { sendReceiptScan, AiContext } from '../../api/aiChat';
import { uploadReceiptImage } from '../../api/receipts';
import { compressForReceipt, CompressedImage } from '../../utils/imageUtils';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { Icon } from '../../utils/icons';

type Step = 'capture' | 'processing' | 'review';

interface OcrItem {
  name: string;
  quantity: number;
  unit_price: number | null;
  total_price: number;
}

interface OcrResult {
  restaurant_name: string | null;
  date: string | null;
  currency_detected: string;
  items: OcrItem[];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
}

interface ReceiptScanModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: {
    imageUrl: string;
    restaurantName: string | null;
    date: string | null;
    currency: string;
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      unit_price: number | null;
      total_price: number;
      assigned_to: { user_id: string; quantity: number }[];
      is_tip: boolean;
    }>;
    subtotal: number | null;
    tax: number | null;
    tip: number | null;
    total: number | null;
    categoryId: string | null;
    paidBy: string | null;
  }) => void;
  tripId: string;
  categories: BudgetCategory[];
  collaborators: CollaboratorWithProfile[];
  currentUserId: string;
  currency: string;
}

let itemIdCounter = 0;
const nextId = () => `item_${Date.now()}_${++itemIdCounter}`;

export const ReceiptScanModal: React.FC<ReceiptScanModalProps> = ({
  visible, onClose, onSave, tripId, categories, collaborators, currentUserId, currency,
}) => {
  const [step, setStep] = useState<Step>('capture');
  const [compressed, setCompressed] = useState<CompressedImage | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OCR results (editable)
  const [restaurantName, setRestaurantName] = useState('');
  const [receiptDate, setReceiptDate] = useState('');
  const [items, setItems] = useState<Array<OcrItem & { id: string }>>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [tax, setTax] = useState(0);
  const [tip, setTip] = useState(0);
  const [total, setTotal] = useState(0);
  const [detectedCurrency, setDetectedCurrency] = useState(currency);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [paidBy, setPaidBy] = useState<string | null>(currentUserId);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reset = useCallback(() => {
    setStep('capture');
    setCompressed(null);
    setPreviewUri(null);
    setProcessing(false);
    setError(null);
    setRestaurantName('');
    setReceiptDate('');
    setItems([]);
    setSubtotal(0);
    setTax(0);
    setTip(0);
    setTotal(0);
    setDetectedCurrency(currency);
    setCategoryId(null);
    setPaidBy(currentUserId);
  }, [currency, currentUserId]);

  const handleFileSelect = useCallback(async (file: File) => {
    try {
      const result = await compressForReceipt(file);
      setCompressed(result);
      setPreviewUri(URL.createObjectURL(result.blob));
      // Start OCR immediately
      setStep('processing');
      setProcessing(true);
      setError(null);

      // Upload to storage
      const fileName = `${Date.now()}.jpg`;
      const imageUrl = await uploadReceiptImage(tripId, result.blob, fileName);

      // Send for OCR
      const context: AiContext = { currency };
      const response = await sendReceiptScan(result.base64, result.mediaType, context);

      // Parse OCR result
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('OCR-Ergebnis konnte nicht gelesen werden');

      const ocr: OcrResult = JSON.parse(jsonMatch[0]);

      setRestaurantName(ocr.restaurant_name || '');
      setReceiptDate(ocr.date || '');
      setDetectedCurrency(ocr.currency_detected || currency);
      setItems(ocr.items.map(item => ({ ...item, id: nextId() })));
      setSubtotal(ocr.subtotal || 0);
      setTax(ocr.tax || 0);
      setTip(ocr.tip || 0);
      setTotal(ocr.total || 0);
      setStep('review');

      // Store imageUrl for save
      (window as any).__lastReceiptImageUrl = imageUrl;
    } catch (e: any) {
      setError(e.message || 'Beleg konnte nicht gelesen werden');
      setStep('processing'); // Stay on processing to show error + retry
    } finally {
      setProcessing(false);
    }
  }, [tripId, currency]);

  const handleSave = useCallback(() => {
    const imageUrl = (window as any).__lastReceiptImageUrl;
    if (!imageUrl) return;

    const receiptItems = items.map(item => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
      assigned_to: [] as { user_id: string; quantity: number }[],
      is_tip: false,
    }));

    // Add tip as a special item if present
    if (tip > 0) {
      receiptItems.push({
        id: nextId(),
        name: 'Trinkgeld',
        quantity: 1,
        unit_price: null,
        total_price: tip,
        assigned_to: collaborators.map(c => ({ user_id: c.user_id, quantity: 1 })),
        is_tip: true,
      });
    }

    onSave({
      imageUrl,
      restaurantName: restaurantName || null,
      date: receiptDate || null,
      currency: detectedCurrency,
      items: receiptItems,
      subtotal: subtotal || null,
      tax: tax || null,
      tip: tip || null,
      total: total || null,
      categoryId,
      paidBy,
    });

    reset();
    onClose();
    delete (window as any).__lastReceiptImageUrl;
  }, [items, tip, restaurantName, receiptDate, detectedCurrency, subtotal, tax, total, categoryId, paidBy, collaborators, onSave, reset, onClose]);

  const updateItem = useCallback((id: string, field: keyof OcrItem, value: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      if (field === 'name') return { ...item, name: value };
      const num = parseFloat(value) || 0;
      if (field === 'quantity') return { ...item, quantity: Math.max(1, Math.round(num)) };
      if (field === 'total_price') return { ...item, total_price: num };
      if (field === 'unit_price') return { ...item, unit_price: num || null };
      return item;
    }));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const addItem = useCallback(() => {
    setItems(prev => [...prev, { id: nextId(), name: '', quantity: 1, unit_price: null, total_price: 0 }]);
  }, []);

  const itemsTotal = items.reduce((sum, i) => sum + i.total_price, 0);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {step === 'capture' ? 'Beleg scannen' : step === 'processing' ? 'Wird analysiert...' : 'Beleg prüfen'}
            </Text>
            <TouchableOpacity onPress={() => { reset(); onClose(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {/* STEP 1: CAPTURE */}
            {step === 'capture' && (
              <View style={styles.captureContainer}>
                <View style={styles.captureIcon}>
                  <Icon name="scan-outline" size={64} color={colors.textLight} />
                </View>
                <Text style={styles.captureText}>Fotografiere einen Kassenbeleg oder wähle ein Bild aus der Galerie</Text>
                {Platform.OS === 'web' ? (
                  <>
                    <input
                      ref={fileInputRef as any}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={(e: any) => {
                        const file = e.target?.files?.[0];
                        if (file) handleFileSelect(file);
                      }}
                    />
                    <Button
                      title="Beleg fotografieren"
                      onPress={() => (fileInputRef.current as any)?.click()}
                      style={styles.captureButton}
                    />
                  </>
                ) : (
                  <Text style={styles.captureText}>Kamera-Unterstützung für Native folgt</Text>
                )}
              </View>
            )}

            {/* STEP 2: PROCESSING */}
            {step === 'processing' && (
              <View style={styles.processingContainer}>
                {previewUri && (
                  <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
                )}
                {processing ? (
                  <View style={styles.processingInfo}>
                    <ActivityIndicator size="large" color={colors.secondary} />
                    <Text style={styles.processingText}>Fable liest den Beleg...</Text>
                  </View>
                ) : error ? (
                  <View style={styles.errorContainer}>
                    <Icon name="alert-circle-outline" size={32} color={colors.error} />
                    <Text style={styles.errorText}>{error}</Text>
                    <Button title="Nochmal versuchen" onPress={() => {
                      setStep('capture');
                      setError(null);
                    }} variant="ghost" />
                  </View>
                ) : null}
              </View>
            )}

            {/* STEP 3: REVIEW */}
            {step === 'review' && (
              <>
                {/* Restaurant & Date */}
                <View style={styles.fieldRow}>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.fieldLabel}>Restaurant</Text>
                    <TextInput
                      style={styles.input}
                      value={restaurantName}
                      onChangeText={setRestaurantName}
                      placeholder="Name"
                      placeholderTextColor={colors.textLight}
                    />
                  </View>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.fieldLabel}>Datum</Text>
                    <TextInput
                      style={styles.input}
                      value={receiptDate}
                      onChangeText={setReceiptDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.textLight}
                    />
                  </View>
                </View>

                {/* Currency warning */}
                {detectedCurrency !== currency && (
                  <View style={styles.warningBanner}>
                    <Icon name="warning-outline" size={16} color={colors.warning} />
                    <Text style={styles.warningText}>
                      Beleg-Währung ({detectedCurrency}) weicht ab von Trip-Währung ({currency})
                    </Text>
                  </View>
                )}

                {/* Items */}
                <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Positionen</Text>
                {items.map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    <View style={styles.itemNameCol}>
                      <TextInput
                        style={styles.itemInput}
                        value={item.name}
                        onChangeText={(v) => updateItem(item.id, 'name', v)}
                        placeholder="Bezeichnung"
                        placeholderTextColor={colors.textLight}
                      />
                    </View>
                    <View style={styles.itemQtyCol}>
                      <TextInput
                        style={[styles.itemInput, styles.itemInputCenter]}
                        value={String(item.quantity)}
                        onChangeText={(v) => updateItem(item.id, 'quantity', v)}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.itemPriceCol}>
                      <TextInput
                        style={[styles.itemInput, styles.itemInputRight]}
                        value={item.total_price.toFixed(2)}
                        onChangeText={(v) => updateItem(item.id, 'total_price', v)}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.itemRemove}>
                      <Icon name="close-circle" size={20} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity onPress={addItem} style={styles.addItemButton}>
                  <Icon name="add-circle-outline" size={20} color={colors.primary} />
                  <Text style={styles.addItemText}>Position hinzufügen</Text>
                </TouchableOpacity>

                {/* Totals */}
                <View style={styles.totalsContainer}>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Items-Summe</Text>
                    <Text style={styles.totalValue}>{detectedCurrency} {itemsTotal.toFixed(2)}</Text>
                  </View>
                  {tax > 0 && (
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>MwSt</Text>
                      <Text style={styles.totalValue}>{detectedCurrency} {tax.toFixed(2)}</Text>
                    </View>
                  )}
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Trinkgeld</Text>
                    <TextInput
                      style={[styles.input, styles.tipInput]}
                      value={tip.toFixed(2)}
                      onChangeText={(v) => setTip(parseFloat(v) || 0)}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={[styles.totalRow, styles.totalRowFinal]}>
                    <Text style={styles.totalLabelBold}>Beleg-Total</Text>
                    <Text style={styles.totalValueBold}>{detectedCurrency} {total.toFixed(2)}</Text>
                  </View>
                  {Math.abs(itemsTotal + tip + tax - total) > 0.1 && (
                    <Text style={styles.diffWarning}>
                      Differenz: {detectedCurrency} {(itemsTotal + tip + tax - total).toFixed(2)}
                    </Text>
                  )}
                </View>

                {/* Category */}
                <Text style={styles.fieldLabel}>Kategorie</Text>
                <View style={styles.chipRow}>
                  {categories.map(cat => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.chip, categoryId === cat.id && { backgroundColor: cat.color, borderColor: cat.color }]}
                      onPress={() => setCategoryId(cat.id)}
                    >
                      <Text style={[styles.chipText, categoryId === cat.id && { color: '#fff' }]}>{cat.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Paid By */}
                {collaborators.length > 0 && (
                  <>
                    <Text style={styles.fieldLabel}>Bezahlt von</Text>
                    <View style={styles.chipRow}>
                      {collaborators.map(c => (
                        <TouchableOpacity
                          key={c.user_id}
                          style={[styles.chip, paidBy === c.user_id && { backgroundColor: colors.secondary, borderColor: colors.secondary }]}
                          onPress={() => setPaidBy(c.user_id)}
                        >
                          <Text style={[styles.chipText, paidBy === c.user_id && { color: '#fff' }]}>
                            {getDisplayName(c.profile)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}
          </ScrollView>

          {/* Footer buttons */}
          {step === 'review' && (
            <View style={styles.footer}>
              <Button title="Abbrechen" onPress={() => { reset(); onClose(); }} variant="ghost" style={styles.btn} />
              <Button title="Speichern" onPress={handleSave} style={styles.btn} disabled={items.length === 0} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  content: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '92%',
    minHeight: 300,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { ...typography.h2 },
  scrollView: { flex: 1 },
  scrollContent: { padding: spacing.xl, paddingTop: spacing.md },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  btn: { flex: 1 },

  // Capture step
  captureContainer: { alignItems: 'center', paddingVertical: spacing.xxl },
  captureIcon: { marginBottom: spacing.lg },
  captureText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg, maxWidth: 280 },
  captureButton: { minWidth: 200 },

  // Processing step
  processingContainer: { alignItems: 'center', paddingVertical: spacing.lg },
  previewImage: { width: '100%', height: 200, borderRadius: borderRadius.md, marginBottom: spacing.lg },
  processingInfo: { alignItems: 'center', gap: spacing.md },
  processingText: { ...typography.body, color: colors.textSecondary },
  errorContainer: { alignItems: 'center', gap: spacing.sm },
  errorText: { ...typography.body, color: colors.error, textAlign: 'center' },

  // Review step
  fieldRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  fieldHalf: { flex: 1 },
  fieldLabel: { ...typography.bodySmall, fontWeight: '600', marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    ...typography.body,
    color: colors.text,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: `${colors.warning}20`,
    borderRadius: borderRadius.sm,
    marginVertical: spacing.sm,
  },
  warningText: { ...typography.caption, color: colors.text, flex: 1 },

  // Items
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  itemNameCol: { flex: 3 },
  itemQtyCol: { flex: 1 },
  itemPriceCol: { flex: 2 },
  itemInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: Platform.OS === 'web' ? 6 : spacing.xs,
    ...typography.bodySmall,
    color: colors.text,
  },
  itemInputCenter: { textAlign: 'center' },
  itemInputRight: { textAlign: 'right' },
  itemRemove: { padding: 4 },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  addItemText: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },

  // Totals
  totalsContainer: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  totalLabel: { ...typography.bodySmall, color: colors.textSecondary },
  totalValue: { ...typography.bodySmall, fontWeight: '600' },
  totalRowFinal: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs },
  totalLabelBold: { ...typography.body, fontWeight: '700' },
  totalValueBold: { ...typography.body, fontWeight: '700', color: colors.primary },
  tipInput: { width: 80, textAlign: 'right', paddingVertical: 4 },
  diffWarning: { ...typography.caption, color: colors.warning, textAlign: 'right', marginTop: spacing.xs },

  // Chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 36,
    justifyContent: 'center' as const,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipText: { ...typography.caption, fontWeight: '600' },
});
