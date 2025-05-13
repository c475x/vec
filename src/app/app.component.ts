import { Component } from '@angular/core';
import { CanvasComponent } from './components/canvas/canvas.component';
import { Tool } from './models/tool.enum';
import { ToolSidebarComponent } from './components/tool-sidebar/tool-sidebar.component';
import { SettingsSidebarComponent } from './components/settings-sidebar/settings-sidebar.component';

@Component({
  selector: 'app-root',
  imports: [CanvasComponent, ToolSidebarComponent, SettingsSidebarComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'vector-studio';
  currentTool: Tool = Tool.Pen;  
}
