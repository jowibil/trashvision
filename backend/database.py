from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config import settings

# Connection health. Runtime uses Neon's POOLED (-pooler) URL and neither
# pooler nor compute keeps sockets open forever: idle connections are closed
# from the server side. A QueuePool with default settings kept those dead
# sockets and handed one to the next request, which is how a 75-frame batch
# died in the AUTH dependency's first query with
# "psycopg2.OperationalError: SSL connection has been closed unexpectedly" —
# the browser had been streaming the multipart body for minutes while the
# pooled connection sat idle, and Neon dropped it in the meantime.
#
# pool_pre_ping validates a connection at checkout (one cheap round-trip) and
# transparently replaces a dead one, instead of raising into whichever request
# picked it up.
#
# pool_recycle retires connections below the pooler's ~5 minute idle cutoff so
# the pool stops topping itself up with sockets that are about to be closed
# from the other end.
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=280,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()