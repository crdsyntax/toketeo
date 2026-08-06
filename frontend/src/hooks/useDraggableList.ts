import { useState, useCallback } from 'react';

export function useDraggableList<T>(initialItems: T[]) {
  const [items, setItems] = useState(initialItems);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number, e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (index: number) => (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragIndex === null || dragIndex === index) return;
      setItems((prev) => {
        const updated = [...prev];
        const [moved] = updated.splice(dragIndex, 1);
        updated.splice(index, 0, moved);
        return updated;
      });
      setDragIndex(index);
    },
    [dragIndex],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
  }, []);

  const isDragging = useCallback(
    (index: number) => dragIndex === index,
    [dragIndex],
  );

  const resetOrder = useCallback(() => {
    setItems(initialItems);
    setDragIndex(null);
  }, [initialItems]);

  return {
    items,
    dragIndex,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    isDragging,
    setItems,
    resetOrder,
  };
}
