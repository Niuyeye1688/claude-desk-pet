import React, { useEffect, useState } from 'react';
import type { PetState } from '../types';

interface PetSpriteProps {
  state: PetState;
  size?: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  delay: number;
}

const PetSprite: React.FC<PetSpriteProps> = ({ state, size = 120 }) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [lookAngle, setLookAngle] = useState(0);

  useEffect(() => {
    const cleanup = window.electronAPI?.onMouseAngle?.((angle: number) => {
      setLookAngle(angle);
    });
    return () => cleanup?.();
  }, []);

  useEffect(() => {
    if (state === 'happy') {
      const newParticles: Particle[] = [
        { id: 1, x: -20, y: -30, delay: 0 },
        { id: 2, x: 0, y: -45, delay: 0.15 },
        { id: 3, x: 20, y: -30, delay: 0.3 },
      ];
      setParticles(newParticles);
      const timer = setTimeout(() => setParticles([]), 1200);
      return () => clearTimeout(timer);
    }
    setParticles([]);
  }, [state]);

  const isSleeping = state === 'sleep';
  const isWalking = state === 'walk';
  const isHappy = state === 'happy';
  const isClick = state === 'click';
  const isType = state === 'type';

  const getAnimationClass = () => {
    if (isWalking) return 'pet-walk';
    if (isHappy) return 'pet-happy';
    if (isClick) return 'pet-click';
    if (isType) return 'pet-type';
    if (isSleeping) return 'pet-sleep';
    return 'pet-idle';
  };

  // Eye positioning math
  const scale = (size * 0.85) / 150;
  const imgRenderedHeight = 96 * scale;
  const imgTopOffset = (size * 0.85 - imgRenderedHeight) / 2;
  const leftEyeBaseX = 52.5 * scale;
  const leftEyeBaseY = imgTopOffset + 34 * scale;
  const rightEyeBaseX = 94.5 * scale;
  const rightEyeBaseY = imgTopOffset + 34 * scale;

  // Pupil fills most of the eye but leaves margin for movement
  const eyeW = 6 * scale;
  const eyeH = 11 * scale;
  const pupilWidth = Math.max(3, 3.5 * scale);
  const pupilHeight = Math.max(4, 5.5 * scale);

  const maxDx = Math.max(0, eyeW / 2 - pupilWidth / 2);
  const maxDy = Math.max(0, eyeH / 2 - pupilHeight / 2);

  const rad = (lookAngle * Math.PI) / 180;
  const pupilDx = Math.cos(rad) * maxDx;
  const pupilDy = Math.sin(rad) * maxDy;

  return (
    <div
      className="pet-sprite-root"
      style={{
        width: size,
        height: size,
        position: 'relative',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {/* Shadow */}
      <div
        className={`pet-shadow ${getAnimationClass()}`}
        style={{
          position: 'absolute',
          bottom: '5%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: size * 0.6,
          height: size * 0.12,
          background: 'rgba(0,0,0,0.25)',
          borderRadius: '50%',
          filter: 'blur(3px)',
          transition: 'all 0.3s ease',
        }}
      />

      {/* Pet Image + Pupils */}
      <div
        className={`pet-body ${getAnimationClass()}`}
        style={{
          width: size * 0.85,
          height: size * 0.85,
          position: 'absolute',
          top: '5%',
          left: '7.5%',
          transition: 'all 0.3s ease',
        }}
      >
        <img
          src="pet.png"
          alt="pet"
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            imageRendering: 'pixelated',
            display: 'block',
          }}
        />
        {!isSleeping && (
          <>
            <div
              style={{
                position: 'absolute',
                left: leftEyeBaseX + pupilDx - pupilWidth / 2,
                top: leftEyeBaseY + pupilDy - pupilHeight / 2,
                width: pupilWidth,
                height: pupilHeight,
                background: '#1a1a1a',
                borderRadius: '1px',
                pointerEvents: 'none',
                transition: 'left 0.1s ease-out, top 0.1s ease-out',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: rightEyeBaseX + pupilDx - pupilWidth / 2,
                top: rightEyeBaseY + pupilDy - pupilHeight / 2,
                width: pupilWidth,
                height: pupilHeight,
                background: '#1a1a1a',
                borderRadius: '1px',
                pointerEvents: 'none',
                transition: 'left 0.1s ease-out, top 0.1s ease-out',
              }}
            />
          </>
        )}
      </div>

      {/* Sleep Zzz */}
      {isSleeping && (
        <>
          <div
            className="pet-zzz pet-zzz-1"
            style={{
              position: 'absolute',
              top: '-5%',
              right: '5%',
              color: '#d4a017',
              fontSize: size * 0.14,
              fontFamily: 'Consolas, monospace',
              fontWeight: 'bold',
            }}
          >
            Z
          </div>
          <div
            className="pet-zzz pet-zzz-2"
            style={{
              position: 'absolute',
              top: '-12%',
              right: '-5%',
              color: '#d4a017',
              fontSize: size * 0.18,
              fontFamily: 'Consolas, monospace',
              fontWeight: 'bold',
            }}
          >
            Z
          </div>
          <div
            className="pet-zzz pet-zzz-3"
            style={{
              position: 'absolute',
              top: '-20%',
              right: '0%',
              color: '#d4a017',
              fontSize: size * 0.22,
              fontFamily: 'Consolas, monospace',
              fontWeight: 'bold',
            }}
          >
            Z
          </div>
        </>
      )}

      {/* Type cursor blink */}
      {isType && (
        <div
          className="pet-type-cursor"
          style={{
            position: 'absolute',
            bottom: '5%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: size * 0.08,
            height: size * 0.12,
            background: '#d4a017',
          }}
        />
      )}

      {/* Happy particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="pet-particle"
          style={{
            position: 'absolute',
            top: '30%',
            left: '50%',
            color: '#d4a017',
            fontSize: size * 0.2,
            fontFamily: 'Consolas, monospace',
            fontWeight: 'bold',
            marginLeft: p.x,
            marginTop: p.y,
            animationDelay: `${p.delay}s`,
          }}
        >
          ★
        </div>
      ))}
    </div>
  );
};

export default PetSprite;
