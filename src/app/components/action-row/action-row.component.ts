import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-action-row',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './action-row.component.html',
  styleUrl: './action-row.component.scss'
})
export class ActionRowComponent {
  @Input() label!: string;
  @Input() disabled: boolean = false;
  @Output() action = new EventEmitter<void>();
}
