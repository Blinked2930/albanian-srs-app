import os
import pandas as pd
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables (from .env.local first, then .env)
load_dotenv(".env.local")
load_dotenv()  # fallback to .env

# Support both naming conventions
SUPABASE_URL = (
    os.getenv("NEXT_PUBLIC_SUPABASE_URL") or
    os.getenv("SUPABASE_URL")
)
SUPABASE_KEY = (
    os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY") or
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
)

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing Supabase credentials. Expected NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def migrate_google_sheet(csv_path: str):
    """
    Migrates the exported Google Sheet (CSV format) into the Supabase 'vocab' table.
    Expected headers in the CSV: 
    - Albanian (Standardized)
    - English
    - Type
    - Confidence
    - Usefulness
    - Date Learned
    """
    print(f"Loading data from {csv_path}...")
    try:
        df = pd.read_csv(csv_path)
    except Exception as e:
        print(f"Error reading CSV: {e}")
        return

    # Rename columns to match database schema conventions
    column_mapping = {
        "Albanian (Standardized)": "albanian",
        "English": "english",
        "Type": "type",
        "Confidence": "confidence",
        "Usefulness": "usefulness"
    }
    
    # Check if expected columns are in the dataframe
    for col in column_mapping.keys():
        if col not in df.columns:
            print(f"Warning: Expected column '{col}' not found in the CSV.")
            
    # Rename columns that exist
    df = df.rename(columns={k: v for k, v in column_mapping.items() if k in df.columns})

    # Clean the data: Fill NaNs or drop invalid rows
        
    if "confidence" in df.columns:
        # User defined Confidence mappings
        mastery_mapping = {
            "New": 0.0,
            "Needs Improvement": 0.3,
            "Almost There": 0.7,
            "Mastered": 1.0
        }
        df["mastery_score"] = df["confidence"].map(mastery_mapping).fillna(0.0)
        
        # We also need to map "Needs Improvement" to "Improvement" for the ENUM mismatch, and "Almost There" to "Almost"
        enum_mapping = {
            "New": "New",
            "Needs Improvement": "Improvement",
            "Almost There": "Almost",
            "Mastered": "Mastered"
        }
        df["confidence"] = df["confidence"].map(enum_mapping).fillna("New")
        
    if "usefulness" in df.columns:
        df["usefulness"] = pd.to_numeric(df["usefulness"], errors='coerce').fillna(5)
        
    # Set default last_seen
    df["last_seen"] = "1970-01-01T00:00:00"
        
    # Drop CSV-specific columns that don't match the database schema
    columns_to_drop = ["Date Learned", "date_learned"]
    for col in columns_to_drop:
        if col in df.columns:
            df = df.drop(columns=[col])
    
    # Only keep the columns that the DB schema expects
    db_columns = ["albanian", "english", "type", "confidence", "usefulness", "mastery_score", "last_seen"]
    df = df[[col for col in db_columns if col in df.columns]]
        
    # Replace NaNs with None for Supabase JSON compatibility
    df = df.where(pd.notnull(df), None)

    records = df.to_dict(orient="records")
    
    print(f"Preparing to insert {len(records)} records into Supabase 'vocab' table...")
    
    # Batch insert to avoid huge payloads
    batch_size = 100
    success_count = 0
    
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        try:
            response = supabase.table("vocab").insert(batch).execute()
            success_count += len(response.data)
            print(f"Inserted batch {i//batch_size + 1} ({len(batch)} records)")
        except Exception as e:
            print(f"Error inserting batch {i//batch_size + 1}: {e}")

    print(f"Migration complete! Successfully inserted {success_count} records.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Migrate Google Sheet CSV to Supabase")
    parser.add_argument("csv_path", help="Path to the exported Google Sheet CSV")
    args = parser.parse_args()
    
    migrate_google_sheet(args.csv_path)
