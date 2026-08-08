# Serendipitous Sequential Book Recommender

> A comparative study on the effectiveness of **LLM-based** versus **Word2Vec-based** embeddings in driving serendipitous sequential book recommendations, applied to the UPNVJT Library dataset.

---

## 📖 About the Project

Traditional recommender systems often trap users in an "accuracy bubble," repeatedly suggesting items similar to their past interactions. This repository contains the code and implementation for an advanced **Sequential Recommendation System (powered by models like SASRec)** designed to introduce **serendipity** (unexpected yet relevant discoveries) into library book recommendations.

The project evaluates and compares two distinct embedding strategies:

1. **Word2Vec Embeddings:** Capturing semantic co-occurrence and contextual word patterns from historical catalog metadata and user logs.
2. **LLM-Based Embeddings:** Leveraging rich semantic representations from Large Language Models to capture deeper contextual nuances, thematic connections, and latent book attributes.

---

## ⚙️ Core Architecture & Methodology

```
[ User History / Logs ] ──> [ Embedding Layer ] ──> [ Sequential Recommender (SASRec) ]
                            ├─ Word2Vec                             │
                            └─ LLM Embeddings                       ▼
                                              [ Serendipity Oriented Greedy (SOG) Algorithm ]
                                                                    │
                                                                    ▼
                                                       [ Final Book Recommendations ]

```

* **Sequential Modeling:** Captures the chronological evolution of a user's reading interests rather than treating interactions as independent events.
* **Serendipity Oriented Greedy (SOG) Algorithm:** Reranks recommendations specifically on **unexpectedness** and **relevance** to surface delightful, out-of-bubble reads. 

---

## 🛠️ Tech Stack

* **Language:** Python 3.10+
* **Deep Learning Framework:** PyTorch
* **Vector Embeddings:** Gensim (Word2Vec), OpenAI / Hugging Face Transformers (LLM Embeddings)
* **Recommender Utilities:** SASRec implementation
* **Data Processing:** Pandas, NumPy, Scikit-learn

---

## 📂 Project Structure

```text
serendipitous-book-recommender/
│
├── data/                  # Dataset directory (raw and processed UPNVJT logs)
├── embeddings/            # Word2Vec training scripts and LLM embedding generators
├── models/                # Sequential recommendation architecture (SASRec implementation)
├── evaluation/            # Metrics calculation (Serendipity, Unexpectedness, NDCG)
├── notebooks/             # Exploratory data analysis and experimental runs
├── requirements.txt       # Python dependencies
└── main.py                # Main execution script for training and evaluation

```

---

## 🚀 Getting Started

### Prerequisites

Make sure you have Python 3.10 or higher installed. It is recommended to use a virtual environment.

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/your-username/serendipitous-book-recommender.git
cd serendipitous-book-recommender

```


2. **Create and activate a virtual environment:**
```bash
python -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate

```


3. **Install dependencies:**
```bash
pip install -r requirements.txt

```



### Running the Pipeline

1. **Preprocess Data:**
```bash
python data/preprocess.py --input data/raw_library_logs.csv

```


2. **Generate Embeddings:**
```bash
python embeddings/generate_embeddings.py --mode [word2vec|llm]

```


3. **Train & Evaluate Model:**
```bash
python main.py --config config.yaml

```



---

## 📊 Evaluation & Metrics

The system performance is benchmarked using:

* **Ranking Metrics:** HR@K, NDCG@K
* **Serendipity Metrics:** Measures distance from the user's expected profile while maintaining high subjective relevance.

---

## 👥 Acknowledgments

* Developed as part of undergraduate research at **Universitas Pembangunan Nasional "Veteran" Jawa Timur (UPNVJT)**.
* Special thanks to thesis advisors and the UPNVJT Library unit for providing the dataset and operational insights.
