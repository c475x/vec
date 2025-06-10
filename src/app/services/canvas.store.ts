import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Shape, ShapeStyle, ImageShape } from '../models/shape.model';
import { Tool } from '../models/tool.enum';
import * as paper from 'paper';

@Injectable({ providedIn: 'root' })
export class CanvasStore {
    /* Canvas state */
    readonly shapes$ = new BehaviorSubject<Shape[]>([]);
    readonly selectedIds$ = new BehaviorSubject<Set<number>>(new Set());

    /* Active style that will be applied to new shapes when nothing is selected */
    readonly activeStyle$ = new BehaviorSubject<ShapeStyle>({
        stroke: '#000000',
        fill: '#d9d9d9',
        strokeWidth: 2,
        fillEnabled: true,
        strokeEnabled: true,
        opacity: 1,
        shadowColor: '#000000',
        shadowBlur: 0,
        shadowOffset: { x: 0, y: 0 },
        shadowOpacity: 1
    });

    /* Active tool (needed by sidebar to show/hide relevant options) */
    readonly activeTool$ = new BehaviorSubject<Tool>(Tool.Move);

    /* Path editing mode flag */
    readonly pathEditMode$ = new BehaviorSubject<boolean>(false);

    /* Whether to hide comments (needed for export) */
    hideComments$ = new BehaviorSubject<boolean>(false);

    /* Whether to hide hover outlines (used during export) */
    hideHover$ = new BehaviorSubject<boolean>(false);

    /* Active text properties for new shapes or selected text shapes */
    readonly activeTextProps$ = new BehaviorSubject<{ fontFamily: string; fontSize: number; justification: string }>({
        fontFamily: 'SF Pro Text',
        fontSize: 20,
        justification: 'left'
    });

    /* ────────── Helpers ────────── */
    updateShapes(mutator: (arr: Shape[]) => void): void {
        const copy = [...this.shapes$.value];
        mutator(copy);
        this.shapes$.next(copy);
    }

    setActiveTool(t: Tool): void {
        this.activeTool$.next(t);
    }

    /** Enter path editing mode */
    enterPathEdit(): void {
        this.pathEditMode$.next(true);
    }

    /** Exit path editing mode */
    exitPathEdit(): void {
        this.pathEditMode$.next(false);
    }

    /* ────────── Selection ────────── */
    clearSelection(): void {
        this.selectedIds$.next(new Set());
    }

    select(id: number): void {
        this.selectedIds$.next(new Set([id]));
    }

    toggle(id: number): void {
        const s = new Set(this.selectedIds$.value);
        s.has(id) ? s.delete(id) : s.add(id);
        this.selectedIds$.next(s);
    }

    /* ────────── Style Updates ────────── */
    updateStyle(patch: Partial<ShapeStyle>): void {
        const sel = this.selectedIds$.value;

        if (sel.size) {
            // Update style of selected shapes
            this.updateShapes((arr) => {
                arr.forEach((sh) => {
                    if (sel.has(sh.id)) {
                        // Merge style patch
                        const newStyle = { ...sh.style, ...patch } as ShapeStyle;
                        // If enabling fill but no color set, use active default
                        if (patch.fillEnabled && !newStyle.fill) {
                            newStyle.fill = this.activeStyle$.value.fill;
                        }
                        // If enabling stroke but no color set, use active default
                        if (patch.strokeEnabled && !newStyle.stroke) {
                            newStyle.stroke = this.activeStyle$.value.stroke;
                        }
                        sh.style = newStyle;
                    }
                });
            });
        } else {
            // Update active style for new shapes
            this.activeStyle$.next({
                ...this.activeStyle$.value,
                ...patch,
            });
        }
    }

    /* ────────── Shape Operations ────────── */
    groupSelected(): void {
        const ids = [...this.selectedIds$.value];
        if (ids.length < 2) return;

        this.updateShapes((arr) => {
            const children = arr.filter((s) => ids.includes(s.id));
            const others = arr.filter((s) => !ids.includes(s.id));
            const group: Shape = {
                id: Date.now(),
                type: 'group',
                children,
                style: { ...this.activeStyle$.value }
            };
            this.selectedIds$.next(new Set([group.id]));
            arr.splice(0, arr.length, ...others, group);
        });
    }

    ungroupSelected(): void {
        this.updateShapes((arr) => {
            const newArr: Shape[] = [];
            arr.forEach((s) => {
                if (s.type === 'group' && this.selectedIds$.value.has(s.id)) {
                    newArr.push(...s.children);
                } else {
                    newArr.push(s);
                }
            });
            this.selectedIds$.next(new Set());
            arr.splice(0, arr.length, ...newArr);
        });
    }

    /* ────────── Path Operations ────────── */
    mergePaths(): void {
        const ids = [...this.selectedIds$.value];
        if (ids.length < 2) return;

        this.updateShapes((arr) => {
            const pathShapes = arr.filter(s => ids.includes(s.id) && s.type === 'path');
            const others = arr.filter(s => !ids.includes(s.id));

            if (pathShapes.length >= 2) {
                // Merge all selected paths into one, preserving first path's style
                const baseStyle = pathShapes[0].style;
                const mergedPath: Shape = {
                    id: Date.now(),
                    type: 'path',
                    segments: pathShapes.flatMap(p => p.type === 'path' ? p.segments : []),
                    closed: false,
                    style: { ...baseStyle }
                };
                this.selectedIds$.next(new Set([mergedPath.id]));
                arr.splice(0, arr.length, ...others, mergedPath);
            }
        });
    }

    /** Duplicate all selected shapes with new IDs and offset positions by 10px */
    duplicateSelected(): void {
        const sel = [...this.selectedIds$.value];
        if (sel.length === 0) return;
        this.updateShapes(arr => {
            const clones: any[] = [];
            sel.forEach(id => {
                const s = arr.find(sh => sh.id === id);
                if (!s) return;
                const baseId = Date.now();
                const offset = 10;
                let clone: any;
                switch (s.type) {
                    case 'path': {
                        const p = s as any;
                        clone = {
                            ...JSON.parse(JSON.stringify(p)),
                            id: baseId * 1000000 + Math.floor(Math.random() * 1000000),
                            segments: p.segments.map((seg: any) => ({
                                point: { x: seg.point.x + offset, y: seg.point.y + offset },
                                handleIn: seg.handleIn ? { x: seg.handleIn.x, y: seg.handleIn.y } : undefined,
                                handleOut: seg.handleOut ? { x: seg.handleOut.x, y: seg.handleOut.y } : undefined
                            }))
                        };
                        break;
                    }
                    default:
                        clone = JSON.parse(JSON.stringify(s));
                        clone.id = baseId * 1000000 + Math.floor(Math.random() * 1000000);
                }
                clones.push(clone);
            });
            arr.push(...clones);
            this.selectedIds$.next(new Set(clones.map(c => c.id)));
        });
    }

    /* ────────── Layer Operations ────────── */
    bringToFront(): void {
        const ids = this.selectedIds$.value;
        this.updateShapes(arr => {
            for (let i = arr.length - 2; i >= 0; i--) {
                if (ids.has(arr[i].id) && !ids.has(arr[i + 1].id)) {
                    [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
                }
            }
        });
    }

    sendToBack(): void {
        const ids = this.selectedIds$.value;
        this.updateShapes(arr => {
            for (let i = 1; i < arr.length; i++) {
                if (ids.has(arr[i].id) && !ids.has(arr[i - 1].id)) {
                    [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
                }
            }
        });
    }

    /** Move selected shapes to absolute front (top of z-order) */
    bringToFrontAll(): void {
        const ids = this.selectedIds$.value;
        this.updateShapes(arr => {
            const selected = arr.filter(s => ids.has(s.id));
            const others = arr.filter(s => !ids.has(s.id));
            arr.splice(0, arr.length, ...others, ...selected);
        });
    }

    /** Move selected shapes to absolute back (bottom of z-order) */
    sendToBackAll(): void {
        const ids = this.selectedIds$.value;
        this.updateShapes(arr => {
            const selected = arr.filter(s => ids.has(s.id));
            const others = arr.filter(s => !ids.has(s.id));
            arr.splice(0, arr.length, ...selected, ...others);
        });
    }

    /** Update text properties (content, font, size, justification) for selected text shapes or active defaults */
    updateTextProps(patch: Partial<{ content: string; fontFamily: string; fontSize: number; justification: string }>): void {
        const sel = this.selectedIds$.value;
        if (sel.size) {
            this.updateShapes(arr => {
                arr.forEach(sh => {
                    if (sel.has(sh.id) && sh.type === 'text') {
                        // Merge text property patch
                        Object.assign(sh, patch);
                    }
                });
            });
        } else {
            // Update active defaults for new text shapes
            const current = this.activeTextProps$.value;
            this.activeTextProps$.next({
                fontFamily: patch.fontFamily ?? current.fontFamily,
                fontSize: patch.fontSize ?? current.fontSize,
                justification: patch.justification ?? current.justification
            });
        }
    }
}
