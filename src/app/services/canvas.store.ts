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

    /* Whether to hide comments (needed for export) */
    hideComments$ = new BehaviorSubject<boolean>(false);

    /* ────────── Helpers ────────── */
    updateShapes(mutator: (arr: Shape[]) => void): void {
        const copy = [...this.shapes$.value];
        mutator(copy);
        this.shapes$.next(copy);
    }

    setActiveTool(t: Tool): void {
        this.activeTool$.next(t);
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
                // Merge all selected paths into one
                const mergedPath: Shape = {
                    id: Date.now(),
                    type: 'path',
                    segments: pathShapes.flatMap(p => p.type === 'path' ? p.segments : []),
                    closed: false,
                    style: { ...this.activeStyle$.value }
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
                            id: baseId + Math.random(),
                            segments: p.segments.map((seg: any) => ({
                                point: { x: seg.point.x + offset, y: seg.point.y + offset },
                                handleIn: seg.handleIn ? { x: seg.handleIn.x, y: seg.handleIn.y } : undefined,
                                handleOut: seg.handleOut ? { x: seg.handleOut.x, y: seg.handleOut.y } : undefined
                            }))
                        };
                        break;
                    }
                    case 'image': {
                        // Clone ImageShape with proper Point and Size instances
                        const im = s as any as ImageShape;
                        clone = {
                            id: Date.now() + Math.random(),
                            type: 'image',
                            source: im.source,
                            position: new paper.Point(im.position.x + offset, im.position.y + offset),
                            size: new paper.Size(im.size.width, im.size.height),
                            style: { ...im.style }
                        } as ImageShape;
                        break;
                    }
                    case 'group': {
                        const g = s as any;
                        // Deep clone the group and its children
                        const groupClone = JSON.parse(JSON.stringify(g)) as any;
                        groupClone.id = baseId + Math.random();
                        // Clone and offset each child in the group
                        groupClone.children = (groupClone.children || []).map((child: any) => {
                            const childClone = JSON.parse(JSON.stringify(child));
                            childClone.id = baseId + Math.random();
                            if (childClone.topLeft) {
                                childClone.topLeft.x += offset;
                                childClone.topLeft.y += offset;
                            }
                            if (childClone.center) {
                                childClone.center.x += offset;
                                childClone.center.y += offset;
                            }
                            if (childClone.segments) {
                                childClone.segments = childClone.segments.map((seg: any) => ({
                                    point: { x: seg.point.x + offset, y: seg.point.y + offset },
                                    handleIn: seg.handleIn ? { x: seg.handleIn.x + offset, y: seg.handleIn.y + offset } : undefined,
                                    handleOut: seg.handleOut ? { x: seg.handleOut.x + offset, y: seg.handleOut.y + offset } : undefined
                                }));
                            }
                            if (childClone.position) {
                                childClone.position.x += offset;
                                childClone.position.y += offset;
                            }
                            return childClone;
                        });
                        clone = groupClone;
                        break;
                    }
                    default:
                        clone = JSON.parse(JSON.stringify(s));
                        clone.id = baseId + Math.random();
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
}
