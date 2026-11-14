"""archive: who/when/previous status + refreshed search text

Revision ID: 0006
Revises: 0005
"""
from alembic import op
import sqlalchemy as sa


revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None

FK = 'fk_documents_archived_by_id_users'


def upgrade() -> None:
    with op.batch_alter_table('documents', schema=None) as batch_op:
        batch_op.add_column(sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('archived_by_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('status_before_archive', sa.String(length=20), nullable=True))
        batch_op.create_foreign_key(FK, 'users', ['archived_by_id'], ['id'])

    # Backfill: document search text now also covers the object's address, cadastral number and code.
    # Lower-casing is done in Python because SQL lower() is ASCII-only on SQLite.
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT d.id, d.title, p.name, p.address, p.cadastral_number, p.code "
        "FROM documents d JOIN projects p ON p.id = d.project_id"
    )).fetchall()
    for id_, title, name, address, cad, code in rows:
        text = " ".join(x for x in (title, name, cad, code, address) if x).lower()
        conn.execute(sa.text("UPDATE documents SET search_text = :t WHERE id = :i"), {"t": text, "i": id_})


def downgrade() -> None:
    with op.batch_alter_table('documents', schema=None) as batch_op:
        batch_op.drop_constraint(FK, type_='foreignkey')
        batch_op.drop_column('status_before_archive')
        batch_op.drop_column('archived_by_id')
        batch_op.drop_column('archived_at')
