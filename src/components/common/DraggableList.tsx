import React, { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Platform, Animated, PanResponder } from 'react-native';
import { colors, spacing } from '../../utils/theme';

interface DraggableListProps<T> {
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, index: number, isDragging: boolean) => React.ReactNode;
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** Height of each item (needed for position calculation) */
  itemHeight: number;
}

/**
 * A lightweight drag-to-reorder list.
 * Uses PanResponder for native and pointer events for web.
 * Items must have a consistent height for position calculation.
 */
export function DraggableList<T>({ data, keyExtractor, renderItem, onReorder, itemHeight }: DraggableListProps<T>) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const dragY = useRef(new Animated.Value(0)).current;
  const startY = useRef(0);
  const currentDragIdx = useRef<number | null>(null);

  const getTargetIndex = useCallback((dy: number, fromIndex: number) => {
    const offset = Math.round(dy / itemHeight);
    const target = Math.max(0, Math.min(data.length - 1, fromIndex + offset));
    return target;
  }, [data.length, itemHeight]);

  // Web: use pointer events for smoother experience
  if (Platform.OS === 'web') {
    return (
      <View>
        {data.map((item, index) => {
          const isDragging = dragIndex === index;
          return (
            <View
              key={keyExtractor(item)}
              style={[
                hoverIndex !== null && hoverIndex === index && dragIndex !== index && styles.dropTarget,
                isDragging && styles.dragging,
              ]}
            >
              <View style={styles.itemRow}>
                <View
                  style={styles.dragHandle}
                  // @ts-ignore — web pointer events
                  onPointerDown={(e: any) => {
                    e.preventDefault();
                    startY.current = e.clientY;
                    currentDragIdx.current = index;
                    setDragIndex(index);
                    setHoverIndex(index);

                    const onMove = (ev: PointerEvent) => {
                      const dy = ev.clientY - startY.current;
                      const target = getTargetIndex(dy, index);
                      setHoverIndex(target);
                    };

                    const onUp = (ev: PointerEvent) => {
                      window.removeEventListener('pointermove', onMove);
                      window.removeEventListener('pointerup', onUp);
                      const dy = ev.clientY - startY.current;
                      const target = getTargetIndex(dy, index);
                      setDragIndex(null);
                      setHoverIndex(null);
                      if (target !== index) {
                        onReorder(index, target);
                      }
                    };

                    window.addEventListener('pointermove', onMove);
                    window.addEventListener('pointerup', onUp);
                  }}
                >
                  <View style={styles.dragDots}>
                    <View style={styles.dot} />
                    <View style={styles.dot} />
                    <View style={styles.dot} />
                    <View style={styles.dot} />
                    <View style={styles.dot} />
                    <View style={styles.dot} />
                  </View>
                </View>
                <View style={styles.itemContent}>
                  {renderItem(item, index, isDragging)}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  // Native: PanResponder-based
  return (
    <View>
      {data.map((item, index) => {
        const isDragging = dragIndex === index;
        return (
          <DraggableItem
            key={keyExtractor(item)}
            index={index}
            isDragging={isDragging}
            isDropTarget={hoverIndex === index && dragIndex !== index}
            itemHeight={itemHeight}
            dataLength={data.length}
            onDragStart={() => { setDragIndex(index); setHoverIndex(index); }}
            onDragMove={(dy) => { setHoverIndex(getTargetIndex(dy, index)); }}
            onDragEnd={(dy) => {
              const target = getTargetIndex(dy, index);
              setDragIndex(null);
              setHoverIndex(null);
              if (target !== index) onReorder(index, target);
            }}
          >
            {renderItem(item, index, isDragging)}
          </DraggableItem>
        );
      })}
    </View>
  );
}

interface DraggableItemProps {
  index: number;
  isDragging: boolean;
  isDropTarget: boolean;
  itemHeight: number;
  dataLength: number;
  onDragStart: () => void;
  onDragMove: (dy: number) => void;
  onDragEnd: (dy: number) => void;
  children: React.ReactNode;
}

const DraggableItem: React.FC<DraggableItemProps> = ({
  isDragging, isDropTarget, onDragStart, onDragMove, onDragEnd, children,
}) => {
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => onDragStart(),
      onPanResponderMove: (_, gs) => onDragMove(gs.dy),
      onPanResponderRelease: (_, gs) => onDragEnd(gs.dy),
      onPanResponderTerminate: (_, gs) => onDragEnd(gs.dy),
    })
  ).current;

  return (
    <View style={[isDropTarget && styles.dropTarget, isDragging && styles.dragging]}>
      <View style={styles.itemRow}>
        <View style={styles.dragHandle} {...panResponder.panHandlers}>
          <View style={styles.dragDots}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
        </View>
        <View style={styles.itemContent}>
          {children}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  itemRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  dragHandle: {
    width: 24,
    justifyContent: 'center',
    alignItems: 'center',
    cursor: 'grab' as any,
  },
  dragDots: {
    width: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    justifyContent: 'center',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.textLight,
  },
  itemContent: {
    flex: 1,
  },
  dragging: {
    opacity: 0.5,
  },
  dropTarget: {
    borderTopWidth: 2,
    borderTopColor: colors.primary,
  },
});
