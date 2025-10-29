from __future__ import annotations
import json
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd

# Resolve repository root (two levels up from this file): analysis/utils.py -> analysis -> repo root
REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / 'data'


def read_csv_safe(path: Path, **kwargs) -> pd.DataFrame:
	if not path.exists():
		raise FileNotFoundError(f"Missing data file: {path}")
	return pd.read_csv(path, low_memory=False, **kwargs)


def load_all() -> Dict[str, pd.DataFrame]:
	"""Load all four CSV exports with basic parsing and column normalization."""
	events = read_csv_safe(DATA_DIR / 'events_rows.csv')
	embeddings = read_csv_safe(DATA_DIR / 'event_embeddings_rows.csv')
	subpaths = read_csv_safe(DATA_DIR / 'frequent_subpaths_rows (1).csv')
	friction = read_csv_safe(DATA_DIR / 'friction_dashboard_rows.csv')

	for col in ['ts', 'created_at']:
		if col in events.columns:
			events[col] = pd.to_datetime(events[col], utc=True, errors='coerce')

	# Attempt to coerce JSON-like columns
	for col in ['meta', 'context_events', 'semantic_context', 'document_context']:
		if col in events.columns:
			try:
				events[col] = events[col].apply(lambda x: json.loads(x) if isinstance(x, str) and x.strip().startswith(('{','[')) else x)
			except Exception:
				pass

	# Parse subpath timestamps if present
	for col in ['first_visit', 'last_visit', 'last_occurrence']:
		if col in subpaths.columns:
			subpaths[col] = pd.to_datetime(subpaths[col], utc=True, errors='coerce')
		if col in friction.columns:
			friction[col] = pd.to_datetime(friction[col], utc=True, errors='coerce')

	return {
		'events': events,
		'embeddings': embeddings,
		'subpaths': subpaths,
		'friction': friction,
	}


def add_time_features(df: pd.DataFrame) -> pd.DataFrame:
	if 'ts' not in df.columns:
		return df
	df = df.copy()
	df['hour'] = df['ts'].dt.hour
	df['weekday'] = df['ts'].dt.weekday
	df['date'] = df['ts'].dt.date
	return df


def sessionize(events: pd.DataFrame, gap_minutes: int = 30) -> pd.DataFrame:
	"""Create session_id and session_index based on time gaps and optional domain changes."""
	if 'ts' not in events.columns:
		return events
	df = events.sort_values('ts').copy()
	gap = pd.Timedelta(minutes=gap_minutes)
	df['prev_ts'] = df['ts'].shift(1)
	df['gap'] = df['ts'] - df['prev_ts']
	domain_change = False
	if 'domain' in df.columns:
		domain_change = (df['domain'] != df['domain'].shift(1))
	new_session = (df['gap'] > gap) | (domain_change if isinstance(domain_change, pd.Series) else False)
	df['session_id'] = new_session.cumsum()
	df['session_index'] = df.groupby('session_id').cumcount()
	return df


def coverage_summary(dfs: Dict[str, pd.DataFrame]) -> pd.DataFrame:
	rows = []
	if 'events' in dfs and 'ts' in dfs['events'].columns:
		e = dfs['events']
		rows.append(['events', e['ts'].min(), e['ts'].max(), len(e)])
	for name in ['subpaths', 'friction']:
		d = dfs.get(name)
		if d is not None:
			start = None
			end = None
			for col in ['first_visit', 'last_visit', 'last_occurrence']:
				if col in d.columns:
					if start is None:
						start = d[col].min()
					end = d[col].max()
			rows.append([name, start, end, len(d)])
	return pd.DataFrame(rows, columns=['dataset', 'start', 'end', 'rows'])
