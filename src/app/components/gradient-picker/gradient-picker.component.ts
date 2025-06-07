import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Gradient, GradientStop } from '../../models/shape.model';
import paper from 'paper';
import { ColorRowComponent } from '../color-row/color-row.component';

@Component({
  selector: 'app-gradient-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, ColorRowComponent],
  templateUrl: './gradient-picker.component.html',
  styleUrls: ['./gradient-picker.component.scss'],
})
export class GradientPickerComponent implements OnChanges {
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

  ngOnChanges(changes: SimpleChanges): void {
    const raw = this.fill;
    if (!raw || typeof raw === 'string') {
      // Treat undefined or string as solid
      this.fillType = 'solid';
      const color = typeof raw === 'string' ? raw : '#000000';
      this.stops = [
        { offset: 0, color },
        { offset: 1, color: '#ffffff' }
      ];
    } else {
      // Domain Gradient or Paper.Gradient
      this.fillType = 'gradient';
      const g = raw as Gradient;
      this.gradientType = g.type;
      this.stops = g.stops.map((s: GradientStop) => ({ ...s }));
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
          origin: new paper.Point(0, 0),
          radius: 0.5
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

  private updatePreview(): void {
    if (this.fillType === 'solid') {
      this.preview = this.stops[0].color;
    } else {
      const colors = this.stops.map(st => `${st.color} ${st.offset * 100}%`).join(', ');
      this.preview = this.gradientType === 'linear'
        ? `linear-gradient(to right, ${colors})`
        : `radial-gradient(circle, ${colors})`;
    }
  }
}