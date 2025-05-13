import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ToolSidebarComponent } from './tool-sidebar.component';

describe('ToolSidebarComponent', () => {
  let component: ToolSidebarComponent;
  let fixture: ComponentFixture<ToolSidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToolSidebarComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ToolSidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
