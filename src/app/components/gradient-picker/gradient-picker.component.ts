import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Gradient, GradientStop } from '../../models/shape.model';
import paper from 'paper';
import { ColorRowComponent } from '../color-row/color-row.component';
import { PropertyRowComponent } from '../property-row/property-row.component';

@Component({
    selector: 'app-gradient-picker',
    standalone: true,
    imports: [CommonModule, FormsModule, ColorRowComponent, PropertyRowComponent],
    templateUrl: './gradient-picker.component.html',
    styleUrls: ['./gradient-picker.component.scss'],
})
export class GradientPickerComponent implements OnChanges {
    @ViewChild('previewCanvas', { static: false }) previewCanvas!: ElementRef<HTMLCanvasElement>;
    /** Current fill: string (solid), Paper.Gradient or domain Gradient */
    @Input() fill: string | paper.Gradient | Gradient | undefined = '#000000';
    @Input() enabled: boolean = true;
    @Output() fillChange = new EventEmitter<string | paper.Gradient | Gradient>();
    @Output() enabledChange = new EventEmitter<boolean>();

    fillType: 'solid' | 'gradient' = 'solid';
    gradientType: 'linear' | 'radial' = 'linear';
    stops: GradientStop[] = [
        { offset: 0, color: '#000000' },
        { offset: 1, color: '#ffffff' }
    ];
    // CSS preview string for background
    preview: string = '';
    /** Normalized (0-1) radial gradient center and radius */
    originX: number = 0;
    originY: number = 0;
    radius: number = 0.5;

    ngOnChanges(changes: SimpleChanges): void {
        const raw = this.fill;
        if (raw && typeof raw !== 'string') {
            // Domain Gradient or Paper.Gradient
            this.fillType = 'gradient';
            const g = raw as Gradient;
            this.gradientType = g.type;
            // Update stops from new gradient
            this.stops = g.stops.map((s: GradientStop) => ({ ...s }));
            // Load radial-specific settings
            if (this.gradientType === 'radial') {
                const rg = g as any;
                this.originX = rg.origin.x;
                this.originY = rg.origin.y;
                this.radius = rg.radius;
            }
        } else {
            // Fill is solid (string) or undefined
            this.fillType = 'solid';
            if (typeof raw === 'string') {
                // Update first stop color to match solid fill
                if (this.stops.length > 0) {
                    this.stops[0].color = raw;
                } else {
                    this.stops = [
                        { offset: 0, color: raw },
                        { offset: 1, color: raw }
                    ];
                }
            }
        }
        this.updatePreview();
    }

    onTypeToggle(type: 'solid' | 'gradient'): void {
        this.fillType = type;
        this.emitChange();
        this.updatePreview();
    }

    onGradientTypeChange(type: 'linear' | 'radial'): void {
        this.gradientType = type;
        this.emitChange();
        this.updatePreview();
    }

    onEnabledToggle(): void {
        this.enabled = !this.enabled;
        this.enabledChange.emit(this.enabled);
        this.updatePreview();
    }

    emitChange(): void {
        if (this.fillType === 'solid') {
            this.fillChange.emit(this.stops[0].color);
        } else {
            let grad: Gradient;
            if (this.gradientType === 'linear') {
                grad = {
                    type: 'linear',
                    stops: this.stops,
                    origin: new paper.Point(0, 0),
                    destination: new paper.Point(1, 0)
                };
            } else {
                grad = {
                    type: 'radial',
                    stops: this.stops,
                    origin: new paper.Point(this.originX, this.originY),
                    radius: this.radius
                };
            }
            this.fillChange.emit(grad);
        }
        this.updatePreview();
    }

    /** Update a stop's offset (0-100%) */
    onOffsetChange(value: number | string, index: number): void {
        // Ensure the entered value stays within 0-100%
        const raw = typeof value === 'string' ? parseFloat(value) : value;
        const clamped = Math.max(0, Math.min(100, isNaN(raw) ? 0 : raw));
        this.stops[index].offset = clamped / 100;
        this.emitChange();
    }

    /** Change a stop's color via color input */
    openStopColorPicker(index: number): void {
        const input = document.createElement('input');
        input.type = 'color';
        input.value = this.stops[index].color;
        input.onchange = () => {
            this.stops[index].color = input.value;
            this.emitChange();
        };
        input.click();
    }

    /** Remove a gradient stop (min 2 stops remain) */
    removeStop(index: number): void {
        if (this.stops.length > 2) {
            this.stops.splice(index, 1);
            this.emitChange();
        }
    }

    /** Add a new gradient stop at midpoint */
    addStop(): void {
        const defaultColor = this.stops[this.stops.length - 1]?.color || '#000000';
        this.stops.push({ offset: 0.5, color: defaultColor });
        this.emitChange();
    }

    /** Change radial gradient center X (%) */
    onOriginXChange(value: number | string): void {
        const raw = typeof value === 'string' ? parseFloat(value) : value;
        const clamped = Math.max(0, Math.min(100, isNaN(raw) ? 0 : raw));
        this.originX = clamped / 100;
        this.emitChange();
    }

    /** Change radial gradient center Y (%) */
    onOriginYChange(value: number | string): void {
        const raw = typeof value === 'string' ? parseFloat(value) : value;
        const clamped = Math.max(0, Math.min(100, isNaN(raw) ? 0 : raw));
        this.originY = clamped / 100;
        this.emitChange();
    }

    /** Change radial gradient radius (%) */
    onRadiusChange(value: number | string): void {
        const raw = typeof value === 'string' ? parseFloat(value) : value;
        const clamped = Math.max(0, Math.min(100, isNaN(raw) ? 0 : raw));
        this.radius = clamped / 100;
        this.emitChange();
    }

    /** Move a stop up in the list */
    moveStopUp(index: number): void {
        if (index <= 0) return;
        // Swap only colors, keep offsets in place
        const prev = this.stops[index - 1];
        const curr = this.stops[index];
        const tmpColor = prev.color;
        prev.color = curr.color;
        curr.color = tmpColor;
        this.emitChange();
    }

    /** Move a stop down in the list */
    moveStopDown(index: number): void {
        if (index >= this.stops.length - 1) return;
        // Swap only colors, keep offsets in place
        const next = this.stops[index + 1];
        const curr = this.stops[index];
        const tmpColor = next.color;
        next.color = curr.color;
        curr.color = tmpColor;
        this.emitChange();
    }

    private updatePreview(): void {
        if (this.fillType === 'solid') {
            // Solid fill: use one color
            this.preview = this.stops[0]?.color || '#000000';
        } else {
            // Sort stops by offset
            this.stops.sort((a, b) => a.offset - b.offset);
            const colors = this.stops.map(st => `${st.color} ${st.offset * 100}%`).join(', ');
            if (this.gradientType === 'linear') {
                this.preview = `linear-gradient(to right, ${colors})`;
            } else {
                const cx = this.originX * 100;
                const cy = this.originY * 100;
                // Radial preview CSS fallback: circle 50%
                this.preview = `radial-gradient(circle 50% at ${cx}% ${cy}%, ${colors})`;
            }
        }
        // If radial, draw the actual gradient on canvas preview
        if (this.gradientType === 'radial') {
            setTimeout(() => this.renderPreviewCanvas());
        }
    }

    /** Draw the radial gradient into the preview canvas */
    private renderPreviewCanvas(): void {
        if (!this.previewCanvas) return;
        const canvas = this.previewCanvas.nativeElement;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        canvas.width = width;
        canvas.height = height;
        // Create radial gradient from canvas dimensions
        const cx = this.originX * width;
        const cy = this.originY * height;
        const radiusPx = Math.max(width, height) / 2;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radiusPx);
        // Sorted stops
        this.stops.sort((a, b) => a.offset - b.offset).forEach(s => grad.addColorStop(s.offset, s.color));
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
    }
}