import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './components.jsx';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export const ImageViewer = ({ src, name, canDownload = false, onDownload, onClose }) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);

  const resetView = () => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === '+' || event.key === '=') setZoom((value) => clampZoom(value + 0.25));
      if (event.key === '-') setZoom((value) => clampZoom(value - 0.25));
      if (event.key === '0') resetView();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const changeZoom = (next) => {
    const value = clampZoom(next);
    setZoom(value);
    if (value <= 1) setOffset({ x: 0, y: 0 });
  };

  const onPointerDown = (event) => {
    if (zoom <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offset,
    };
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset({
      x: drag.offset.x + event.clientX - drag.startX,
      y: drag.offset.y + event.clientY - drag.startY,
    });
  };

  const stopDragging = (event) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  return (
    <div className="image-viewer" role="dialog" aria-modal="true" aria-label={name}>
      <div className="image-viewer-topbar">
        <div className="image-viewer-name" title={name}>{name}</div>
        <div className="image-viewer-tools">
          <button className="btn btn-icon" type="button" title="Zoom out"
            onClick={() => changeZoom(zoom - 0.25)} disabled={zoom <= MIN_ZOOM}>
            <Icon name="minus" size={16}/>
          </button>
          <button className="btn image-viewer-zoom" type="button" title="Reset view" onClick={resetView}>
            {Math.round(zoom * 100)}%
          </button>
          <button className="btn btn-icon" type="button" title="Zoom in"
            onClick={() => changeZoom(zoom + 0.25)} disabled={zoom >= MAX_ZOOM}>
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
          changeZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25));
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}>
        <img src={src} alt={name} draggable={false}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)` }}/>
      </div>
    </div>
  );
};
