import { TestBed } from '@angular/core/testing';

import { EditorState } from './editor-state';

describe('EditorState', () => {
  let service: EditorState;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EditorState);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
