import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './components.jsx';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;
const ZOOM_STEP = 0.1;

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function distance(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function midpoint(left, right) {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

export const ImageViewer = ({
  src,
  name,
  canDownload = false,
  canPrevious = false,
  canNext = false,
  onPrevious,
  onNext,
  onDownload,
  onClose,
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const zoomRef = useRef(zoom);
  const offsetRef = useRef(offset);

  zoomRef.current = zoom;
  offsetRef.current = offset;

  const resetView = () => {
    pointersRef.current.clear();
    gestureRef.current = null;
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  useEffect(resetView, [src]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && canPrevious) onPrevious();
      if (event.key === 'ArrowRight' && canNext) onNext();
      if (event.key === '+' || event.key === '=') setZoom((value) => clampZoom(value + ZOOM_STEP));
      if (event.key === '-') setZoom((value) => clampZoom(value - ZOOM_STEP));
      if (event.key === '0') resetView();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canNext, canPrevious, onClose, onNext, onPrevious]);

  const changeZoom = (next) => {
    const value = clampZoom(next);
    setZoom(value);
    if (value <= 1) setOffset({ x: 0, y: 0 });
  };

  const startGesture = () => {
    const points = [...pointersRef.current.values()];
    if (points.length >= 2) {
      const center = midpoint(points[0], points[1]);
      gestureRef.current = {
        type: 'pinch',
        distance: distance(points[0], points[1]),
        zoom: zoomRef.current,
        center,
        offset: offsetRef.current,
      };
    } else if (points.length === 1 && zoomRef.current > 1) {
      gestureRef.current = {
        type: 'pan',
        point: points[0],
        offset: offsetRef.current,
      };
    } else {
      gestureRef.current = null;
    }
  };

  const onPointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    startGesture();
  };

  const onPointerMove = (event) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    const gesture = gestureRef.current;

    if (points.length >= 2 && gesture?.type === 'pinch') {
      const center = midpoint(points[0], points[1]);
      const nextZoom = clampZoom(gesture.zoom * (distance(points[0], points[1]) / Math.max(1, gesture.distance)));
      setZoom(nextZoom);
      setOffset({
        x: gesture.offset.x + center.x - gesture.center.x,
        y: gesture.offset.y + center.y - gesture.center.y,
      });
    } else if (points.length === 1 && gesture?.type === 'pan') {
      setOffset({
        x: gesture.offset.x + points[0].x - gesture.point.x,
        y: gesture.offset.y + points[0].y - gesture.point.y,
      });
    }
  };

  const stopPointer = (event) => {
    pointersRef.current.delete(event.pointerId);
    startGesture();
  };

  return (
    <div className="image-viewer" role="dialog" aria-modal="true" aria-label={name}>
      <div className="image-viewer-topbar">
        <div className="image-viewer-name" title={name}>{name}</div>
        <div className="image-viewer-tools">
          <button className="btn btn-icon" type="button" title="Zoom out"
            onClick={() => changeZoom(zoom - ZOOM_STEP)} disabled={zoom <= MIN_ZOOM}>
            <Icon name="minus" size={16}/>
          </button>
          <button className="btn image-viewer-zoom" type="button" title="Reset view" onClick={resetView}>
            {Math.round(zoom * 100)}%
          </button>
          <button className="btn btn-icon" type="button" title="Zoom in"
            onClick={() => changeZoom(zoom + ZOOM_STEP)} disabled={zoom >= MAX_ZOOM}>
            <Icon name="plus" size={16}/>
          </button>
          <button className="btn btn-icon" type="button" title="Rotate"
            onClick={() => setRotation((value) => (value + 90) % 360)}>
            <Icon name="rotate" size={16}/>
          </button>
          <button className="btn" type="button" title="Fit image" onClick={resetView}>Fit</button>
          {canDownload && (
            <button className="btn btn-icon" type="button" title="Download" onClick={onDownload}>
              <Icon name="download" size={16}/>
            </button>
          )}
          <button className="btn btn-icon" type="button" title="Close" onClick={onClose}>
            <Icon name="x" size={16}/>
          </button>
        </div>
      </div>
      <div className={'image-viewer-stage' + (zoom > 1 ? ' can-pan' : '')}
        onDoubleClick={() => changeZoom(zoom === 1 ? 2 : 1)}
        onWheel={(event) => {
          event.preventDefault();
          changeZoom(zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopPointer}
        onPointerCancel={stopPointer}>
        {canPrevious && (
          <button className="image-viewer-nav previous" type="button" title="Previous image"
            onPointerDown={(event) => event.stopPropagation()} onClick={onPrevious}>
            <Icon name="chevron-left" size={24}/>
          </button>
        )}
        <img src={src} alt={name} draggable={false}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)` }}/>
        {canNext && (
          <button className="image-viewer-nav next" type="button" title="Next image"
            onPointerDown={(event) => event.stopPropagation()} onClick={onNext}>
            <Icon name="chevron-right" size={24}/>
          </button>
        )}
      </div>
    </div>
  );
};
