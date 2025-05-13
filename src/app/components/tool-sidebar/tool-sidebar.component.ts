import { Component, EventEmitter, Output, ViewChild } from '@angular/core';
import { Tool } from '../../models/tool.enum';
import { CommonModule } from '@angular/common';
import { CanvasComponent } from '../canvas/canvas.component';

@Component({
  selector: 'app-tool-sidebar',
  imports: [CommonModule],
  templateUrl: './tool-sidebar.component.html',
  styleUrl: './tool-sidebar.component.scss'
})
export class ToolSidebarComponent {
  Tool = Tool;

  @Output() toolSelect = new EventEmitter<Tool>();  

  selected: Tool = Tool.Pen;  

  select(tool: Tool): void {  
    this.selected = tool;  
    this.toolSelect.emit(tool);  
  }  
}
