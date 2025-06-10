import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as paper from 'paper';
import { SectionComponent } from '../section/section.component';
import { PropertyRowComponent } from '../property-row/property-row.component';
import { ColorRowComponent } from '../color-row/color-row.component';
import { GradientPickerComponent } from '../gradient-picker/gradient-picker.component';
import { ActionRowComponent } from '../action-row/action-row.component';
import { CanvasStore } from '../../services/canvas.store';
import { Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { Shape, ShapeStyle, GroupShape, PathShape } from '../../models/shape.model';

@Component({
    selector: 'app-right-sidebar',
    standalone: true,
    imports: [
        CommonModule,
        SectionComponent,
        PropertyRowComponent,
        ColorRowComponent,
        GradientPickerComponent,
        ActionRowComponent
    ],
    templateUrl: './right-sidebar.component.html',
    styleUrls: ['./right-sidebar.component.scss']
})
export class RightSidebarComponent {
    shapes$!: Observable<Shape[]>;
    selectedIds$!: Observable<Set<number>>;
    activeStyle$!: Observable<ShapeStyle>;
    singleShape$!: Observable<Shape | null>;
    style$!: Observable<ShapeStyle>;
    canGroup$!: Observable<boolean>;
    canUngroup$!: Observable<boolean>;
    canMerge$!: Observable<boolean>;
    canReorder$!: Observable<boolean>;

    @ViewChild('exportCanvasContainer', { static: true, read: ElementRef })
    exportContainer!: ElementRef;

    canvasX$!: Observable<number>;
    canvasY$!: Observable<number>;
    canvasW$!: Observable<number>;
    canvasH$!: Observable<number>;

    constructor(public store: CanvasStore) {
        this.shapes$ = this.store.shapes$;
        this.selectedIds$ = this.store.selectedIds$;
        this.activeStyle$ = this.store.activeStyle$;
        this.style$ = this.activeStyle$;

        this.singleShape$ = combineLatest([this.store.shapes$, this.store.selectedIds$]).pipe(
            map(([shapes, sel]) => {
                if (sel.size === 1) {
                    const id = [...sel][0];
                    return shapes.find(s => s.id === id) || null;
                }
                return null;
            })
        );

        this.canGroup$ = this.selectedIds$.pipe(map(sel => sel.size >= 2));
        this.canUngroup$ = combineLatest([this.shapes$, this.selectedIds$]).pipe(
            map(([shapes, sel]) => [...sel].some(id => shapes.find(s => s.id === id)?.type === 'group'))
        );
        this.canMerge$ = combineLatest([this.shapes$, this.selectedIds$]).pipe(
            map(([shapes, sel]) => {
                const selected = shapes.filter(s => sel.has(s.id));
                return selected.length >= 2 && selected.every(s => s.type === 'path');
            })
        );
        this.canReorder$ = this.selectedIds$.pipe(map(sel => sel.size > 0));

        // Position observables using shape data from store
        this.canvasX$ = this.singleShape$.pipe(
            map(s => {
                if (!s) return 0;
                if (s.type === 'path') return (s.paperObject?.bounds.x ?? 0);
                if (s.type === 'image') return (s.position.x - s.size.width / 2);
                return 0;
            })
        );
        this.canvasY$ = this.singleShape$.pipe(
            map(s => {
                if (!s) return 0;
                if (s.type === 'path') return (s.paperObject?.bounds.y ?? 0);
                if (s.type === 'image') return (s.position.y - s.size.height / 2);
                return 0;
            })
        );
        this.canvasW$ = this.singleShape$.pipe(
            map(s => {
                if (!s) return 0;
                if (s.type === 'path') return (s.paperObject?.bounds.width ?? 0);
                if (s.type === 'image') return s.size.width;
                return 0;
            })
        );
        this.canvasH$ = this.singleShape$.pipe(
            map(s => {
                if (!s) return 0;
                if (s.type === 'path') return (s.paperObject?.bounds.height ?? 0);
                if (s.type === 'image') return s.size.height;
                return 0;
            })
        );
    }

    // Group dimension calculations
    getGroupX(shape: Shape): number {
        if (shape.type === 'group') {
            return shape.paperObject?.bounds.x ?? 0;
        }
        return 0;
    }

    getGroupY(shape: Shape): number {
        if (shape.type === 'group') {
            return shape.paperObject?.bounds.y ?? 0;
        }
        return 0;
    }

    getGroupW(shape: Shape): number {
        if (shape.type === 'group') {
            return shape.paperObject?.bounds.width ?? 0;
        }
        return 0;
    }

    getGroupH(shape: Shape): number {
        if (shape.type === 'group') {
            return shape.paperObject?.bounds.height ?? 0;
        }
        return 0;
    }

    // Event handlers
    onPositionChange(prop: 'x' | 'y' | 'w' | 'h', val: number) {
        console.log('[sidebar] onPositionChange', prop, val, Array.from(this.store.selectedIds$.value));
        const selIds = this.store.selectedIds$.value;
        if (selIds.size === 0) return;
        this.store.updateShapes(shapes => {
            shapes.forEach(shape => {
                if (!selIds.has(shape.id)) return;
                switch (shape.type) {
                    case 'path': {
                        const p = shape as PathShape;
                        const b = shape.paperObject!.bounds;
                        if (prop === 'x' || prop === 'y') {
                            const dx = prop === 'x' ? val - b.x : 0;
                            const dy = prop === 'y' ? val - b.y : 0;
                            (p as PathShape).segments.forEach(seg => {
                                seg.point.x += dx;
                                seg.point.y += dy;
                            });
                        } else if (prop === 'w' || prop === 'h') {
                            const newW = prop === 'w' ? Math.max(1, val) : b.width;
                            const newH = prop === 'h' ? Math.max(1, val) : b.height;
                            const kx = newW / b.width;
                            const ky = newH / b.height;
                            const pivot = b.topLeft.clone();
                            // Clone and scale the Paper.js path for accurate resizing
                            const item = shape.paperObject as paper.Path;
                            const clone = item.clone({ insert: false }) as paper.Path;
                            clone.scale(kx, ky, pivot);
                            p.segments = clone.segments.map(seg => seg.clone());
                            p.closed = clone.closed;
                            clone.remove();
                        }
                        break;
                    }
                    case 'image':
                        if (prop === 'x') shape.position.x = val + shape.size.width / 2;
                        if (prop === 'y') shape.position.y = val + shape.size.height / 2;
                        if (prop === 'w') shape.size.width = Math.max(1, val);
                        if (prop === 'h') shape.size.height = Math.max(1, val);
                        break;
                    case 'group': {
                        const grp = shape as GroupShape;
                        const b = shape.paperObject!.bounds;
                        if (prop === 'x' || prop === 'y') {
                            const dx = prop === 'x' ? val - b.x : 0;
                            const dy = prop === 'y' ? val - b.y : 0;
                            grp.children.forEach(child => {
                                if (child.type === 'path') {
                                    (child as PathShape).segments.forEach(seg => {
                                        seg.point.x += dx;
                                        seg.point.y += dy;
                                    });
                                } else if (child.type === 'image') {
                                    child.position.x += dx;
                                    child.position.y += dy;
                                }
                            });
                        } else if (prop === 'w' || prop === 'h') {
                            const newW = prop === 'w' ? Math.max(1, val) : b.width;
                            const newH = prop === 'h' ? Math.max(1, val) : b.height;
                            const kx = newW / b.width;
                            const ky = newH / b.height;
                            const pivot = b.topLeft.clone();
                            const groupItem = shape.paperObject as paper.Group;
                            const clone = groupItem.clone({ insert: false }) as paper.Group;
                            clone.scale(kx, ky, pivot);
                            const grpModel = shape as GroupShape;
                            clone.children.forEach((childClone, idx) => {
                                const childModel = grpModel.children[idx];
                                if (childModel.type === 'path') {
                                    (childModel as PathShape).segments = (childClone as paper.Path).segments.map(seg => seg.clone());
                                    (childModel as PathShape).closed = (childClone as paper.Path).closed;
                                } else if (childModel.type === 'image') {
                                    (childModel as any).position = childClone.bounds.center.clone();
                                    (childModel as any).size = childClone.bounds.size.clone();
                                }
                            });
                            clone.remove();
                        }
                        break;
                    }
                }
            });
        });
        // Trigger canvas re-render via hideComments and shapes stream
        this.store.hideComments$.next(this.store.hideComments$.value);
        this.store.shapes$.next([...this.store.shapes$.value]);
        // Trigger canvas update by simulating resize event
        window.dispatchEvent(new Event('resize'));
    }

    onStyleChange(patch: Partial<ShapeStyle>) {
        this.store.updateStyle(patch);
    }

    onShadowOffsetXChange(value: number): void {
        const currentShape = this.store.shapes$.value.find(s => 
            this.store.selectedIds$.value.has(s.id)
        );
        const y = currentShape?.style?.shadowOffset?.y ?? 0;
        this.onStyleChange({ shadowOffset: { x: value, y } });
    }

    onShadowOffsetYChange(value: number): void {
        const currentShape = this.store.shapes$.value.find(s => 
            this.store.selectedIds$.value.has(s.id)
        );
        const x = currentShape?.style?.shadowOffset?.x ?? 0;
        this.onStyleChange({ shadowOffset: { x, y: value } });
    }

    // Handle corner radius change for rectangle-like paths (PathShapes)
    onCornerRadiusChange(value: number): void {
        const sel = this.store.selectedIds$.value;
        // Only update when exactly one shape selected
        if (sel.size !== 1) return;
        // Update model cornerRadius; canvas will re-render via shapes$ subscription
        this.store.updateShapes(shapes => {
            const id = [...sel][0];
            const shape = shapes.find(s => s.id === id);
            if (shape && shape.type === 'path') {
                (shape as PathShape).cornerRadius = value;
            }
        });
    }

    // Export functionality
    exportAs(format: 'png' | 'jpg' | 'svg'): void {
        if (!this.exportContainer) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size to match the artboard
        canvas.width = 800;  // Set to your artboard width
        canvas.height = 600; // Set to your artboard height

        // Draw using Paper.js
        const project = new paper.Project(canvas);
        this.store.shapes$.value.forEach(shape => {
            if (shape.paperObject) {
                shape.paperObject.clone({ insert: true });
            }
        });

        // Export
        let blob: Blob;
        if (format === 'svg') {
            const svg = project.exportSVG({ asString: true }) as string;
            blob = new Blob([svg], { type: 'image/svg+xml' });
        } else {
            const dataUrl = canvas.toDataURL(`image/${format}`);
            const base64 = dataUrl.split(',')[1];
            const byteString = atob(base64);
            const byteArray = new Uint8Array(byteString.length);
            for (let i = 0; i < byteString.length; i++) {
                byteArray[i] = byteString.charCodeAt(i);
            }
            blob = new Blob([byteArray], { type: `image/${format}` });
        }

        this.downloadBlob(blob, `vector-studio.${format}`);

        // Cleanup
        project.remove();
    }

    private downloadBlob(blob: Blob, filename: string) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    // Actions with shift key support for z-order
    onBringToFront(event: MouseEvent): void {
        if (event.shiftKey) {
            this.store.bringToFrontAll();
        } else {
            this.store.bringToFront();
        }
    }

    onSendToBack(event: MouseEvent): void {
        if (event.shiftKey) {
            this.store.sendToBackAll();
        } else {
            this.store.sendToBack();
        }
    }
}
