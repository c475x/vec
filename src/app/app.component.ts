import { Component } from '@angular/core';
import { CanvasComponent } from './components/canvas/canvas.component';
import { Tool } from './models/tool.enum';
import { ToolbarComponent } from './components/toolbar/toolbar.component';
import { LeftSidebarComponent } from './components/left-sidebar/left-sidebar.component';
import { RightSidebarComponent } from './components/right-sidebar/right-sidebar.component';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [
        ToolbarComponent,
        LeftSidebarComponent,
        CanvasComponent,
        RightSidebarComponent
    ],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})
export class AppComponent {
    title = 'vector-studio';
    currentTool: Tool = Tool.Move;
}
