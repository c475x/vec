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
                if (s.type === 'rectangle') return s.topLeft.x;
                if (s.type === 'ellipse') return s.center.x - s.radius.width;
                if (s.type === 'path') return (s.paperObject?.bounds.x ?? 0);
                if (s.type === 'image') return (s.position.x - s.size.width / 2);
                return 0;
            })
        );
        this.canvasY$ = this.singleShape$.pipe(
            map(s => {
                if (!s) return 0;
                if (s.type === 'rectangle') return s.topLeft.y;
                if (s.type === 'ellipse') return s.center.y - s.radius.height;
                if (s.type === 'path') return (s.paperObject?.bounds.y ?? 0);
                if (s.type === 'image') return (s.position.y - s.size.height / 2);
                return 0;
            })
        );
        this.canvasW$ = this.singleShape$.pipe(
            map(s => {
                if (!s) return 0;
                if (s.type === 'rectangle') return s.size.width;
                if (s.type === 'ellipse') return s.radius.width * 2;
                if (s.type === 'path') return (s.paperObject?.bounds.width ?? 0);
                if (s.type === 'image') return s.size.width;
                return 0;
            })
        );
        this.canvasH$ = this.singleShape$.pipe(
            map(s => {
                if (!s) return 0;
                if (s.type === 'rectangle') return s.size.height;
                if (s.type === 'ellipse') return s.radius.height * 2;
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
        const sel = this.store.selectedIds$.value;
        this.store.updateShapes(shapes => {
            shapes.forEach(shape => {
                if (!sel.has(shape.id)) return;
                if (shape.type === 'rectangle') {
                    if (prop === 'x') shape.topLeft.x = val;
                    if (prop === 'y') shape.topLeft.y = val;
                    if (prop === 'w') shape.size.width = val;
                    if (prop === 'h') shape.size.height = val;
                } else if (shape.type === 'ellipse') {
                    if (prop === 'x') shape.center.x = val + (shape.radius?.width ?? 0);
                    if (prop === 'y') shape.center.y = val + (shape.radius?.height ?? 0);
                    if (prop === 'w' && shape.radius) shape.radius.width = val / 2;
                    if (prop === 'h' && shape.radius) shape.radius.height = val / 2;
                } else if (shape.type === 'image') {
                    // Update image position and size; position is center
                    if (prop === 'x') shape.position.x = val + shape.size.width / 2;
                    if (prop === 'y') shape.position.y = val + shape.size.height / 2;
                    if (prop === 'w') shape.size.width = val;
                    if (prop === 'h') shape.size.height = val;
                }
            });
        });
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

    // Handle corner radius change for rectangles
    onCornerRadiusChange(value: number): void {
        const sel = this.store.selectedIds$.value;
        this.store.updateShapes(shapes => {
            shapes.forEach(shape => {
                if (!sel.has(shape.id)) return;
                if (shape.type === 'rectangle' || shape.type === 'image') {
                    (shape as any).radius = value;
                }
            });
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
}
