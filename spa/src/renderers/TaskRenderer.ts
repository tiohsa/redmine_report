import { CalculatedBar } from '../services/LayoutEngine';

export class TaskRenderer {
  render(ctx: CanvasRenderingContext2D, bars: CalculatedBar[]): void {
    bars.forEach((bar) => {
      this.drawBar(ctx, bar);
    });
  }

  private drawBar(ctx: CanvasRenderingContext2D, bar: CalculatedBar): void {
    const { x, y, width, height, data } = bar;
    const radius = 4;

    ctx.save();

    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;

    // Background
    ctx.fillStyle = data.is_delayed ? '#dc2626' : '#2563eb'; // Red-600 or Blue-600
    if (data.is_delayed) {
      // Allow for different styling if needed, e.g. lighter red
      ctx.fillStyle = '#ef4444'; // Red-500
    }

    // Draw Rounded Rect
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();

    // Progress
    if (data.progress_rate > 0) {
      const progressWidth = width * (data.progress_rate / 100);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      // Clip to the bar shape to ensure progress doesn't bleed out
      ctx.roundRect(x, y, width, height, radius);
      ctx.clip();
      ctx.fillRect(x, y, progressWidth, height);
    }

    // Text
    ctx.shadowColor = 'transparent'; // Reset shadow for text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Text fitting logic could be added here
    if (width > 20) {
      ctx.fillText(`${data.category_name}`, x + width / 2, y + height / 2);
    }

    // Progress Badge (Optional - as per image "90%", "50%")
    // If there is space, draw the % on the right or inside
    // The image shows % inside on the right.
    if (data.progress_rate > 0 && width > 50) {
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(data.progress_rate)}%`, x + width - 6, y + height / 2);
    }

    ctx.restore();
  }
}
