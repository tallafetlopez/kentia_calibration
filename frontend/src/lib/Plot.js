/**
 * Custom Plotly component using plotly.js-dist-min (lighter bundle).
 * Import this instead of "react-plotly.js" in all chart components.
 *
 * Usage: import Plot from "../lib/Plot";
 */
import React from "react";
import Plotly from "plotly.js-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";

// Guard against sporadic purge crashes during React unmount in dev/runtime.
if (typeof Plotly?.purge === "function") {
	const originalPurge = Plotly.purge.bind(Plotly);
	Plotly.purge = (graphDiv) => {
		try {
			return originalPurge(graphDiv);
		} catch (_err) {
			return undefined;
		}
	};
}

const PlotlyComponent = createPlotlyComponent(Plotly);

function Plot(props) {
	const safeLayout = {
		...(props.layout || {}),
	};

	if (!Array.isArray(safeLayout.annotations)) {
		safeLayout.annotations = [];
	}

	if (!Array.isArray(safeLayout.shapes)) {
		safeLayout.shapes = [];
	}

	return <PlotlyComponent {...props} layout={safeLayout} />;
}

export default Plot;
