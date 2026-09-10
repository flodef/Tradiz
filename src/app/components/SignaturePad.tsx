'use client';

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { IconTrash, IconCheck } from '@tabler/icons-react';
import AdminButton from './admin/AdminButton';

interface SignaturePadProps {
    /** Called with PNG data URL when the user signs. */
    onChange: (dataUrl: string) => void;
    /** Width of the canvas in pixels (default 400). */
    width?: number;
    /** Height of the canvas in pixels (default 200). */
    height?: number;
    /** Whether the pad is disabled. */
    disabled?: boolean;
}

/**
 * A canvas-based signature pad that supports touch, mouse, and stylus input.
 * The signature is exported as a PNG data URL.
 */
export const SignaturePad: FC<SignaturePadProps> = ({ onChange, width = 400, height = 200, disabled = false }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const hasDrawnRef = useRef(false);
    const [hasSignature, setHasSignature] = useState(false);

    // Get the canvas context, handling high-DPI displays
    const getContext = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        return { canvas, ctx };
    }, []);

    // Initialize canvas with white background
    useEffect(() => {
        const { canvas, ctx } = getContext() ?? {};
        if (!canvas || !ctx) return;
        // Set actual canvas size for high-DPI
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.scale(dpr, dpr);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }, [getContext, width, height]);

    // Get pointer position relative to canvas
    const getPos = useCallback(
        (e: PointerEvent | TouchEvent | MouseEvent): { x: number; y: number } | null => {
            const canvas = canvasRef.current;
            if (!canvas) return null;
            const rect = canvas.getBoundingClientRect();
            const scaleX = width / rect.width;
            const scaleY = height / rect.height;
            if ('touches' in e) {
                const touch = e.touches[0] || e.changedTouches[0];
                if (!touch) return null;
                return {
                    x: (touch.clientX - rect.left) * scaleX,
                    y: (touch.clientY - rect.top) * scaleY,
                };
            }
            return {
                x: ((e as MouseEvent).clientX - rect.left) * scaleX,
                y: ((e as MouseEvent).clientY - rect.top) * scaleY,
            };
        },
        [width, height]
    );

    const startDraw = useCallback(
        (e: React.PointerEvent) => {
            if (disabled) return;
            e.preventDefault();
            drawingRef.current = true;
            const pos = getPos(e.nativeEvent);
            if (pos) lastPointRef.current = pos;
        },
        [disabled, getPos]
    );

    const draw = useCallback(
        (e: React.PointerEvent) => {
            if (!drawingRef.current || disabled) return;
            e.preventDefault();
            const { ctx } = getContext() ?? {};
            const pos = getPos(e.nativeEvent);
            if (!ctx || !pos || !lastPointRef.current) return;
            ctx.beginPath();
            ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
            lastPointRef.current = pos;
            hasDrawnRef.current = true;
            if (!hasSignature) setHasSignature(true);
        },
        [disabled, getContext, getPos, hasSignature]
    );

    const endDraw = useCallback(() => {
        if (!drawingRef.current) return;
        drawingRef.current = false;
        lastPointRef.current = null;
        // Export PNG only if the user actually drew something
        if (!hasDrawnRef.current) return;
        const canvas = canvasRef.current;
        if (canvas) {
            onChange(canvas.toDataURL('image/png'));
        }
    }, [onChange]);

    const clear = useCallback(() => {
        const { ctx } = getContext() ?? {};
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        hasDrawnRef.current = false;
        setHasSignature(false);
        onChange('');
    }, [getContext, width, height, onChange]);

    return (
        <div className="flex flex-col items-center gap-2">
            <canvas
                ref={canvasRef}
                onPointerDown={startDraw}
                onPointerMove={draw}
                onPointerUp={endDraw}
                onPointerLeave={endDraw}
                onPointerCancel={endDraw}
                className="border-2 border-gray-300 dark:border-gray-600 rounded-lg cursor-crosshair touch-none"
                style={{ width: `${width}px`, height: `${height}px` }}
            />
            <div className="flex justify-center">
                <AdminButton
                    variant="danger"
                    onClick={clear}
                    disabled={disabled || !hasSignature}
                    className="text-sm px-3 py-1.5"
                >
                    <IconTrash size={16} />
                    Effacer
                </AdminButton>
            </div>
            {hasSignature && (
                <span className="flex items-center gap-1 text-sm text-green-600">
                    <IconCheck size={16} />
                    Signature capturée
                </span>
            )}
        </div>
    );
};
