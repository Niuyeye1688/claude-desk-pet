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
  const isTypingRef = useRef(false);
  const hoverRef = useRef(false);
  const walkRafId = useRef<number | null>(null);
  const lastWalkTime = useRef(0);

  // Listen for typing status from main process (chat focus + global keyboard)
  useEffect(() => {
    const cleanup = window.electronAPI?.onTypingStatus?.((isTyping: boolean) => {
      isTypingRef.current = isTyping;
      if (isTyping) {
        pause();
        setState('type');
      } else {
        setState('idle');
        resume();
      }
    });
    return () => {
      cleanup?.();
    };
  }, [pause, resume, setState]);

  // Walk movement: slowly drift the pet window across the screen
  useEffect(() => {
    if (state !== 'walk' || isDragging || isHovered) {
      if (walkRafId.current !== null) {
        cancelAnimationFrame(walkRafId.current);
        walkRafId.current = null;
      }
      return;
    }

    const MOVE_INTERVAL = 400;
    const MOVE_STEP = 4;
    const PET_WINDOW_SIZE = 160;

    let screenSize = { width: 1920, height: 1080 };
    window.electronAPI?.invoke('get-screen-size').then((size: unknown) => {
      if (size) screenSize = size as { width: number; height: number };
    });

    let walkDirX = (Math.random() - 0.5) * 2;
    let walkDirY = (Math.random() - 0.5) * 2;
    const len = Math.sqrt(walkDirX * walkDirX + walkDirY * walkDirY) || 1;
    walkDirX /= len;
    walkDirY /= len;

    const tick = (time: number) => {
      walkRafId.current = requestAnimationFrame(tick);
      if (time - lastWalkTime.current < MOVE_INTERVAL) return;
      lastWalkTime.current = time;

      const pos = { x: window.screenX, y: window.screenY };
      let newX = pos.x + walkDirX * MOVE_STEP;
      let newY = pos.y + walkDirY * MOVE_STEP;

      if (Math.random() < 0.02) {
        walkDirX = (Math.random() - 0.5) * 2;
        walkDirY = (Math.random() - 0.5) * 2;
        const l = Math.sqrt(walkDirX * walkDirX + walkDirY * walkDirY) || 1;
        walkDirX /= l;
        walkDirY /= l;
      }

      const maxX = screenSize.width - PET_WINDOW_SIZE;
      const maxY = screenSize.height - PET_WINDOW_SIZE;
      if (newX < 0) { newX = 0; walkDirX = Math.abs(walkDirX); }
      if (newX > maxX) { newX = maxX; walkDirX = -Math.abs(walkDirX); }
      if (newY < 0) { newY = 0; walkDirY = Math.abs(walkDirY); }
      if (newY > maxY) { newY = maxY; walkDirY = -Math.abs(walkDirY); }

      window.electronAPI?.petMove({ x: Math.round(newX), y: Math.round(newY) });
    };

    walkRafId.current = requestAnimationFrame(tick);
    return () => {
      if (walkRafId.current !== null) {
        cancelAnimationFrame(walkRafId.current);
        walkRafId.current = null;
      }
    };
  }, [state, isDragging, isHovered]);

  useEffect(() => {
    const cleanup = window.electronAPI?.onPetNotify((type: string) => {
      if (type === 'reminder') {
        setState('happy');
        setTimeout(() => setState('idle'), 3000);
      }
    });
    return () => cleanup?.();
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
      if (!isTypingRef.current && !hoverRef.current) {
        resume();
      }
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
      onMouseEnter={() => { setIsHovered(true); hoverRef.current = true; pause(); }}
      onMouseLeave={() => { setIsHovered(false); hoverRef.current = false; if (!isTypingRef.current) resume(); }}
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
