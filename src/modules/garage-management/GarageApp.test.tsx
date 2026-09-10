import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import GarageApp from './GarageApp';
import approvedSourceHtml from './approved-source.html?raw';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/garage-management/*" element={<GarageApp />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('garage-management approved source', () => {
  it('mounts the approved HTML prototype on the existing route', () => {
    renderAt('/garage-management');
    const frame = screen.getByTitle('ניהול מוסך') as HTMLIFrameElement;
    expect(frame).toBeInTheDocument();
    expect(frame.srcdoc).toContain('פתח תיק');
    expect(frame.srcdoc).toContain('דליה — לקוחות ישירים');
    expect(frame.srcdoc).toContain('מפת נזקים אינטראקטיבית');
    expect(frame.srcdoc).toContain('הזמנת עבודה');
    expect(frame.srcdoc).toContain('שיתוף מאובטח');
    expect(frame.srcdoc).toContain('קבלת רכב');
    expect(frame.srcdoc).toContain('סיום עבודה');
    expect(frame.srcdoc).toContain('סגירת תיק');
  });

  it('keeps nested garage-management paths on the same approved source', () => {
    renderAt('/garage-management/cases/case-1056');
    expect(screen.getByTitle('ניהול מוסך')).toBeInTheDocument();
  });

  it('preserves the approved flow screens in the source document', () => {
    expect(approvedSourceHtml).toContain('id="s-home"');
    expect(approvedSourceHtml).toContain('id="s-choose"');
    expect(approvedSourceHtml).toContain('id="s-search"');
    expect(approvedSourceHtml).toContain('id="s-newtype"');
    expect(approvedSourceHtml).toContain('id="s-newform"');
    expect(approvedSourceHtml).toContain('id="s-newvehicle"');
    expect(approvedSourceHtml).toContain('id="s-vehform"');
    expect(approvedSourceHtml).toContain('id="s-case"');
    expect(approvedSourceHtml).toContain('id="s-inspect"');
    expect(approvedSourceHtml).toContain('id="s-quote"');
    expect(approvedSourceHtml).toContain('id="s-quote-preview"');
    expect(approvedSourceHtml).toContain('id="s-workorder"');
    expect(approvedSourceHtml).toContain('id="s-gallery"');
    expect(approvedSourceHtml).toContain('id="s-comm"');
    expect(approvedSourceHtml).toContain('id="s-compose"');
    expect(approvedSourceHtml).toContain('id="s-share"');
    expect(approvedSourceHtml).toContain('id="s-intake"');
    expect(approvedSourceHtml).toContain('id="s-job"');
    expect(approvedSourceHtml).toContain('id="s-finish"');
    expect(approvedSourceHtml).toContain('id="s-close"');
    expect(approvedSourceHtml).toContain('id="s-timeline"');
    expect(approvedSourceHtml).toContain('function go(id)');
    expect(approvedSourceHtml).toContain('function createShareLink()');
    expect(approvedSourceHtml).toContain('function confirmIntake()');
    expect(approvedSourceHtml).toContain('function confirmCloseCase()');
  });
});
