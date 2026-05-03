import os
os.environ.setdefault("KERAS_BACKEND", "tensorflow")

import numpy as np
import tensorflow as tf
import keras
import keras_hub
from keras import ops

class SasRecLLM(keras.Model):
    def __init__(
        self,
        vocabulary_size,
        num_layers,
        num_heads,
        hidden_dim,
        llm_embedding_matrix,
        dropout=0.0,
        max_sequence_length=100,
        dtype=None,
        k=10,
        **kwargs,
    ):
        super().__init__(dtype=dtype, **kwargs)
        
        self.llm_dim = llm_embedding_matrix.shape[1]

        # ======== Layers ========
        self.item_embedding = keras.layers.Embedding(
            input_dim=vocabulary_size,
            output_dim=self.llm_dim,
            embeddings_initializer=keras.initializers.Constant(llm_embedding_matrix),
            trainable=False, # freeze
            dtype=dtype,
            name="item_embedding",
        )
        
        # === 2. Projection Layer ===
        self.projection = keras.layers.Dense(
            units=hidden_dim,
            activation=None,
            name="llm_projection"
        ) if self.llm_dim != hidden_dim else None

        # === 3. Position Embeddings ===
        self.position_embedding = keras_hub.layers.PositionEmbedding(
            initializer="glorot_uniform",
            sequence_length=max_sequence_length,
            dtype=dtype,
            name="position_embedding",
        )
        self.embeddings_add = keras.layers.Add(dtype=dtype, name="embeddings_add")
        self.embeddings_dropout = keras.layers.Dropout(dropout, dtype=dtype, name="embeddings_dropout")

        # === Decoder layers ===
        self.transformer_layers = []
        for i in range(num_layers):
            self.transformer_layers.append(
                keras_hub.layers.TransformerDecoder(
                    intermediate_dim=hidden_dim,
                    num_heads=num_heads,
                    dropout=dropout,
                    layer_norm_epsilon=1e-05,
                    activation="relu",
                    kernel_initializer="glorot_uniform",
                    normalize_first=True,
                    dtype=dtype,
                    name=f"transformer_layer_{i}",
                )
            )

        self.layer_norm = keras.layers.LayerNormalization(axis=-1, epsilon=1e-8, dtype=dtype, name="layer_norm")

        # === Loss ===
        self.loss_fn = keras.losses.BinaryCrossentropy(from_logits=True, reduction=None)

        # === Attributes ===
        self.vocabulary_size = vocabulary_size
        self.num_layers = num_layers
        self.num_heads = num_heads
        self.hidden_dim = hidden_dim
        self.dropout = dropout
        self.max_sequence_length = max_sequence_length

    def _get_last_non_padding_token(self, tensor, padding_mask):
        valid_token_mask = ops.logical_not(padding_mask)
        seq_lengths = ops.sum(ops.cast(valid_token_mask, "int32"), axis=1)
        last_token_indices = ops.maximum(seq_lengths - 1, 0)
        indices = ops.expand_dims(last_token_indices, axis=(-2, -1))
        gathered_tokens = ops.take_along_axis(tensor, indices, axis=1)
        return ops.squeeze(gathered_tokens, axis=1)

    def call(self, inputs, training=False):
        item_ids, padding_mask = inputs["item_ids"], inputs["padding_mask"]

        x = self.item_embedding(item_ids)
        
        if self.projection is not None:
            x = self.projection(x)
            
        position_embedding = self.position_embedding(x)
        x = self.embeddings_add((x, position_embedding))
        x = self.embeddings_dropout(x, training=training)

        for transformer_layer in self.transformer_layers:
            x = transformer_layer(x, decoder_padding_mask=padding_mask, training=training)

        item_sequence_embedding = self.layer_norm(x)
        result = {"item_sequence_embedding": item_sequence_embedding}

        # Inference
        if not training:
            last_item_embedding = self._get_last_non_padding_token(item_sequence_embedding, padding_mask)
            
            all_items = ops.arange(0, self.vocabulary_size)
            all_item_embs = self.item_embedding(all_items)
            if self.projection is not None:
                all_item_embs = self.projection(all_item_embs)
                
            scores = ops.matmul(last_item_embedding, ops.transpose(all_item_embs))
            
            _, top_k_indices = ops.top_k(scores, k=20) 
            result["predictions"] = top_k_indices

        return result

    def compute_loss(self, x, y, y_pred, sample_weight, training=False):
        item_sequence_embedding = y_pred["item_sequence_embedding"]
        y_positive_sequence = y["positive_sequence"]
        y_negative_sequence = y["negative_sequence"]

        pos_emb = self.item_embedding(y_positive_sequence)
        neg_emb = self.item_embedding(y_negative_sequence)
        
        if self.projection is not None:
            pos_emb = self.projection(pos_emb)
            neg_emb = self.projection(neg_emb)

        # Logits
        positive_logits = ops.sum(ops.multiply(pos_emb, item_sequence_embedding), axis=-1)
        negative_logits = ops.sum(ops.multiply(neg_emb, item_sequence_embedding), axis=-1)
        logits = ops.concatenate([positive_logits, negative_logits], axis=1)

        # Labels & Weights
        labels = ops.concatenate([ops.ones_like(positive_logits), ops.zeros_like(negative_logits)], axis=1)
        sample_weight = ops.concatenate([sample_weight, sample_weight], axis=1)

        loss = self.loss_fn(
            y_true=ops.expand_dims(labels, axis=-1),
            y_pred=ops.expand_dims(logits, axis=-1),
            sample_weight=sample_weight,
        )
        return ops.divide_no_nan(ops.sum(loss), ops.sum(sample_weight))
