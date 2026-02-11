import { CalculatedRow } from '../services/LayoutEngine';

export class BackgroundRenderer {
  getMonthLinePositions(months: number, width: number): number[] {
    const step = width / months;
    return Array.from({ length: months + 1 }, (_, i) => i * step);
  }

  render(
    ctx: CanvasRenderingContext2D,
    rows: CalculatedRow[],
    months: number,
    width: number,
    height: number
  ): void {
    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // Draw Row Backgrounds & Dividers
    rows.forEach((row) => {
      // Divider
      ctx.beginPath();
      ctx.strokeStyle = '#e5e7eb'; // Gray-200
      ctx.lineWidth = 1;
      ctx.moveTo(0, row.y + row.height);
      ctx.lineTo(width, row.y + row.height);
      ctx.stroke();
    });

    // Draw Month Vertical Lines
    const lines = this.getMonthLinePositions(months, width);
    ctx.strokeStyle = '#f3f4f6'; // Gray-100 (lighter for grid)
    lines.forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    });

    ctx.restore();
  }
}
