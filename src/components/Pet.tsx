import React, { useState, useRef, useEffect, useCallback } from 'react';
import PetSprite from './PetSprite';
import { usePetStore } from '../stores/petStore';
import { usePetBehavior } from '../hooks/usePetBehavior';

const Pet: React.FC = () => {
  const { state, resume, pause } = usePetBehavior();
  const { setState, setChatOpen, config } = usePetStore();
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const petRef = useRef<HTMLDivElement>(null);
  const dragPauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMove = useRef<{ x: number; y: number } | null>(null);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    window.electronAPI?.onPetNotify((type: string) => {
      if (type === 'reminder') {
        setState('happy');
        setTimeout(() => setState('idle'), 3000);
      }
    });
  }, [setState]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (!petRef.current?.contains(e.target as Node)) return;
    setIsDragging(true);
    pause();
    dragOffset.current = {
      x: e.screenX - window.screenX,
      y: e.screenY - window.screenY,
    };
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      const newX = e.screenX - dragOffset.current.x;
      const newY = e.screenY - dragOffset.current.y;
      pendingMove.current = { x: Math.round(newX), y: Math.round(newY) };

      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(() => {
          rafId.current = null;
          if (pendingMove.current) {
            window.electronAPI?.petMove(pendingMove.current);
            pendingMove.current = null;
          }
        });
      }
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    if (pendingMove.current) {
      window.electronAPI?.petMove(pendingMove.current);
      pendingMove.current = null;
    }
    if (dragPauseTimer.current) clearTimeout(dragPauseTimer.current);
    dragPauseTimer.current = setTimeout(() => {
      resume();
    }, 2000);
  }, [isDragging, resume]);

  const handleDoubleClick = () => {
    setState('click');
    setChatOpen(true);
    window.electronAPI?.toggleChat(true);
    setTimeout(() => setState('idle'), 500);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    window.electronAPI?.showContextMenu();
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      ref={petRef}
      className="pet-window"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={isHovered ? 'pet-hover' : ''}
        style={{
          transition: 'transform 0.3s ease',
          transform: isHovered ? 'scale(1.05)' : 'scale(1)',
        }}
      >
        <PetSprite state={state} size={config.petSize ?? 120} />
      </div>
    </div>
  );
};

export default Pet;
