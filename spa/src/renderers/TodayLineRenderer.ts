export class TodayLineRenderer {
    render(
        ctx: CanvasRenderingContext2D,
        height: number,
        totalWidth: number,
        months: number,
        viewStartDate?: Date
    ): void {
        const now = new Date();
        // Default to 1st of current month if not passed, but caller should pass it
        const start = viewStartDate || (() => {
            const d = new Date();
            d.setDate(1);
            return d;
        })();

        const msPerDay = 1000 * 60 * 60 * 24;
        const totalDays = months * 30; // Approx

        // Check if Today is within range?
        const diffDays = (now.getTime() - start.getTime()) / msPerDay;
        const x = (diffDays / totalDays) * totalWidth;

        if (x < 0 || x > totalWidth) return;

        ctx.save();

        // Draw Line
        ctx.beginPath();
        ctx.strokeStyle = '#ef4444'; // Red-500
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]); // Dashed
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        // Draw "Today" Label/Circle
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(x, 0, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('Today', x + 6, 12);

        ctx.restore();
    }
}
